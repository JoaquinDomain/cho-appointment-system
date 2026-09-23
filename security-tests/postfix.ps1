# Post-fix rate-limit & proxy tests (fresh dev server, empty buckets).
# JSON bodies go through temp files: PowerShell 5.1 mangles quotes in
# native curl.exe -d arguments, which would fake-pass tests via parse errors.
$base = 'http://localhost:3000'
$loginUrl = "$base/api/admin/login"
$results = @()
$bodyFile = Join-Path $env:TEMP 'cho-rl-body.json'

function Post-Json($url, $json, $xff) {
  Set-Content -LiteralPath $bodyFile -Value $json -Encoding ASCII -NoNewline
  $args = @('-s', '-D', '-', '-o', 'NUL', '-X', 'POST', $url,
            '-H', 'Content-Type: application/json',
            '--data-binary', "@$bodyFile")
  if ($xff) { $args += @('-H', "X-Forwarded-For: $xff") }
  $raw = [string]::Join("`n", (curl.exe @args))
  $status = if ($raw -match 'HTTP/[\d.]+\s+(\d+)') { [int]$Matches[1] } else { 0 }
  return [pscustomobject]@{ Status = $status; Raw = $raw }
}

Write-Output '--- 1. Dedicated IP (XFF rightmost 198.51.100.10), UNIQUE email each try (avoids account lockout):11 -> 429 on 11th (IP limit) ---'
$codes1 = @()
foreach ($i in 1..11) {
  $r = Post-Json $loginUrl "{`"email`":`"rl-probe-$i@example.com`",`"password`":`"wrongpassword123`"}" '198.51.100.10'
  $codes1 += "$($r.Status)"
}
Write-Output "dedicated-ip: $($codes1 -join ', ')"
$ok1 = ($codes1[0..9] -notcontains '429') -and ($codes1[10] -eq '429')
$results += [pscustomobject]@{ Test='per-IP login limit (10/10min)'; Result=$(if($ok1){'PASS'}else{'FAIL'}); Notes=($codes1 -join ',') }

Write-Output '--- 2. Spoofed LEFT x-forwarded-for, SAME rightmost (198.51.100.77), unique emails -> 429 on 11th ---'
$codes2 = @()
foreach ($i in 1..11) {
  $r = Post-Json $loginUrl "{`"email`":`"rl-probe2-$i@example.com`",`"password`":`"wrongpassword123`"}" "203.0.113.$i, 198.51.100.77"
  $codes2 += "$($r.Status)"
}
Write-Output "xff-same-rightmost: $($codes2 -join ', ')"
$ok2 = ($codes2[0..9] -notcontains '429') -and ($codes2[10] -eq '429')
$results += [pscustomobject]@{ Test='left-side XFF spoof cannot mint new buckets'; Result=$(if($ok2){'PASS'}else{'FAIL'}); Notes=($codes2 -join ',') }

Write-Output '--- 3. Retry-After present on 429 (reuse limited IP bucket from test 1) ---'
$r3 = Post-Json $loginUrl '{"email":"rl-probe-extra@example.com","password":"wrongpassword123"}' '198.51.100.10'
$hasRetry = $r3.Raw -match '(?i)retry-after'
$results += [pscustomobject]@{ Test='429 has Retry-After header'; Result=$(if($hasRetry -and $r3.Status -eq 429){'PASS'}else{'FAIL'}); Notes="status=$($r3.Status)" }

Write-Output '--- 4. Per-account lockout: dedicated IP, SAME email,5 wrong pw then 6th -> 401 x5 then 429 ---'
$codes4 = @()
foreach ($i in 1..6) {
  $r = Post-Json $loginUrl '{"email":"lockout-probe@example.com","password":"wrongpassword123"}' '198.51.100.50'
  $codes4 += "$($r.Status)"
}
Write-Output "per-account: $($codes4 -join ', ')"
$ok4 = ($codes4[0..4] -join ',' -eq '401,401,401,401,401') -and ($codes4[5] -eq '429')
$results += [pscustomobject]@{ Test='per-account lockout (5 fails/15min)'; Result=$(if($ok4){'PASS'}else{'FAIL'}); Notes=($codes4 -join ',') }

Write-Output '--- 4b. Same locked-out email from a DIFFERENT IP still -> 429 (account lock follows the email) ---'
$r4b = Post-Json $loginUrl '{"email":"lockout-probe@example.com","password":"wrongpassword123"}' '203.0.113.99'
$results += [pscustomobject]@{ Test='account lockout applies across IPs'; Result=$(if($r4b.Status -eq 429){'PASS'}else{'FAIL'}); Notes="status=$($r4b.Status)" }

Write-Output '--- 5. Different email on fresh IP still allowed (lockout is per-email) ---'
$r5 = Post-Json $loginUrl '{"email":"another-probe@example.com","password":"wrongpassword123"}' '203.0.113.200'
$results += [pscustomobject]@{ Test='fresh IP+email not blocked by other lockouts'; Result=$(if($r5.Status -eq 401){'PASS'}else{'FAIL'}); Notes="status=$($r5.Status)" }

Write-Output '--- 6. Login body validation: invalid email shape -> 401 (no server error) ---'
$r6 = Post-Json $loginUrl '{"email":"not-an-email","password":"whatever12345"}' '203.0.113.202'
$results += [pscustomobject]@{ Test='invalid email format rejected with 401'; Result=$(if($r6.Status -eq 401){'PASS'}else{'FAIL'}); Notes="status=$($r6.Status)" }

Write-Output '--- 7. Proxy: public paths reachable; admin paths 401 ---'
$q = curl.exe -s -o NUL -w "%{http_code}" "$base/api/quotas?date=2026-10-01"
$results += [pscustomobject]@{ Test='GET /api/quotas public still 200'; Result=$(if($q -eq '200'){'PASS'}else{'FAIL'}); Notes="code=$q" }
$ci = curl.exe -s -o NUL -w "%{http_code}" -X POST "$base/api/appointments/11111111-1111-4111-8111-111111111111/check-in"
$results += [pscustomobject]@{ Test='POST check-in unauth -> 401'; Result=$(if($ci -eq '401'){'PASS'}else{'FAIL'}); Notes="code=$ci" }
Set-Content -LiteralPath $bodyFile -Value '{}' -Encoding ASCII -NoNewline
$bk = curl.exe -s -o NUL -w "%{http_code}" -X POST "$base/api/appointments" -H "Content-Type: application/json" -H "X-Forwarded-For: 203.0.113.203" --data-binary "@$bodyFile"
$results += [pscustomobject]@{ Test='POST booking public reaches route (turnstile 403/400)'; Result=$(if($bk -in @('400','403','429')){'PASS'}else{'FAIL'}); Notes="code=$bk" }

Write-Output '--- 8. CSP header tightened ---'
$homeHdr = [string]::Join("`n", (curl.exe -s -D - -o NUL "$base/"))
$noEval = -not ($homeHdr -match 'unsafe-eval')
$results += [pscustomobject]@{ Test='CSP has no unsafe-eval'; Result=$(if($noEval){'PASS'}else{'FAIL'}); Notes='' }
$hasXss = $homeHdr -match '(?i)x-xss-protection:\s*0'
$results += [pscustomobject]@{ Test='X-XSS-Protection: 0 header'; Result=$(if($hasXss){'PASS'}else{'FAIL'}); Notes='' }

Write-Output '--- 9. Error bodies carry no infra details ---'
Set-Content -LiteralPath $bodyFile -Value '{"first_name":"A","last_name":"B"}' -Encoding ASCII -NoNewline
$v = curl.exe -s -X POST "$base/api/appointments" -H "Content-Type: application/json" -H "X-Forwarded-For: 203.0.113.204" --data-binary "@$bodyFile"
$leak = ($v -match 'wrangler|CLOUDFLARE_|no such table|database token|Bearer ')
$results += [pscustomobject]@{ Test='no infra leakage in error bodies'; Result=$(if($leak){'FAIL'}else{'PASS'}); Notes=$v.Substring(0, [Math]::Min(160, $v.Length)) }

$results | Format-Table -AutoSize -Wrap
$pass = ($results | Where-Object Result -eq 'PASS').Count
$fail = ($results | Where-Object Result -eq 'FAIL').Count
Write-Output "`nPASS: $pass  FAIL: $fail"
$results | Export-Csv -NoTypeInformation security-tests/postfix-test-results.csv
