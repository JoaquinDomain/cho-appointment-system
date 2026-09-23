# Baseline security tests against local dev server (no writes to DB)
$base = 'http://localhost:3000'
$results = @()

function Test-Case($name, $actual, $expectContains, $expectStatus) {
  $ok = $true
  $notes = @()
  if ($expectStatus) {
    if ($actual.StatusCode -ne $expectStatus) { $ok = $false; $notes += "status=$($actual.StatusCode) want=$expectStatus" }
  }
  foreach ($e in $expectContains) {
    if ($actual.Body -notlike "*$e*") { $ok = $false; $notes += "missing '$e'" }
  }
  $script:results += [pscustomobject]@{ Test=$name; Result=$(if($ok){'PASS'}else{'FAIL'}); Notes=($notes -join '; '); Status=$actual.StatusCode }
}

function Req($method, $path, $body, $headers) {
  try {
    $p = @{ Uri="$base$path"; Method=$method; UseBasicParsing=$true; TimeoutSec=15 }
    if ($body -ne $null) { $p.Body = $body; $p.ContentType = 'application/json' }
    if ($headers) { $p.Headers = $headers }
    $r = Invoke-WebRequest @p
    return [pscustomobject]@{ StatusCode=$r.StatusCode; Body=$r.Content; Headers=$r.Headers }
  } catch {
    $resp = $_.Exception.Response
    if ($resp) {
      $sr = New-Object System.IO.StreamReader($resp.GetResponseStream())
      $b = $sr.ReadToEnd()
      return [pscustomobject]@{ StatusCode=[int]$resp.StatusCode; Body=$b; Headers=@{} }
    }
    return [pscustomobject]@{ StatusCode=0; Body=$_.Exception.Message; Headers=@{} }
  }
}

# 1. Unauthenticated access to admin/data routes -> expect 401 (or 405 for wrong method)
Test-Case 'GET /api/appointments unauth' (Req 'GET' '/api/appointments') @('Unauthorized') 401
Test-Case 'GET /api/appointments/[uuid] unauth' (Req 'GET' '/api/appointments/11111111-1111-4111-8111-111111111111') @('Unauthorized') 401
Test-Case 'PATCH /api/appointments/[uuid] unauth' (Req 'PATCH' '/api/appointments/11111111-1111-4111-8111-111111111111' '{"status":"confirmed"}') @('Unauthorized') 401
Test-Case 'PUT /api/appointments/[uuid] unauth' (Req 'PUT' '/api/appointments/11111111-1111-4111-8111-111111111111' '{}') @('Unauthorized') 401
Test-Case 'DELETE /api/appointments/[uuid] unauth' (Req 'DELETE' '/api/appointments/11111111-1111-4111-8111-111111111111') @('Unauthorized') 401
Test-Case 'GET /api/admin/me unauth' (Req 'GET' '/api/admin/me') @('Unauthorized') 401
Test-Case 'POST /api/admin/walkins unauth' (Req 'POST' '/api/admin/walkins' '{}') @('Unauthorized') 401
Test-Case 'POST /api/appointments/[id]/check-in unauth' (Req 'POST' '/api/appointments/11111111-1111-4111-8111-111111111111/check-in') @('Unauthorized') 401
Test-Case 'GET /api/appointments/[id]/check-in wrong method unauth' (Req 'GET' '/api/appointments/11111111-1111-4111-8111-111111111111/check-in') @('Unauthorized') 401

# 2. Public endpoints behave
$q = Req 'GET' '/api/quotas?date=2026-10-01'
Test-Case 'GET /api/quotas public 200 no PII' $q @('counts') 200
$piiLeak = ($q.Body -match 'patient_name|contact_number|birthdate|@gmail') 
$results += [pscustomobject]@{ Test='quotas response has no PII'; Result=$(if($piiLeak){'FAIL'}else{'PASS'}); Notes=''; Status=$q.StatusCode }

# 3. Booking with invalid body -> blocked (403 turnstile or 400 validation), no infra leakage
$b = Req 'POST' '/api/appointments' '{}'
$leak = ($b.Body -match 'wrangler|CLOUDFLARE_|no such table|SELECT |INSERT |Bearer |database token')
$results += [pscustomobject]@{ Test='POST /appointments invalid body rejected'; Result=$(if($b.StatusCode -in 400,403,422){'PASS'}else{'FAIL'}); Notes="status=$($b.StatusCode)"; Status=$b.StatusCode }
$results += [pscustomobject]@{ Test='no infra leakage in 400 body'; Result=$(if($leak){'FAIL'}else{'PASS'}); Notes=$b.Body.Substring(0,[Math]::Min(200,$b.Body.Length)); Status=$b.StatusCode }

# 4. SQL-ish input doesn't inject / still 400
$s = Req 'POST' '/api/appointments' '{"first_name":"Robert''); DROP TABLE appointments;--","last_name":"Test","birthdate":"1990-01-01","contact_number":"09171234567","consultation_facility":"CHO Main","selected_tests":["CBC"],"appointment_date":"2099-01-01"}'
$results += [pscustomobject]@{ Test='SQLi attempt rejected'; Result=$(if($s.StatusCode -in 400,403,422){'PASS'}else{'FAIL'}); Notes="status=$($s.StatusCode)"; Status=$s.StatusCode }

# 5. Login with wrong creds (2 attempts only, avoid lockout in baseline)
$l1 = Req 'POST' '/api/admin/login' '{"email":"notexist@example.com","password":"wrongpassword123"}'
$l2 = Req 'POST' '/api/admin/login' '{"email":"irealjayy@gmail.com","password":"wrongpassword123"}'
$results += [pscustomobject]@{ Test='login unknown email -> 401 same message'; Result=$(if($l1.StatusCode -eq 401 -and $l2.StatusCode -eq 401 -and $l1.Body -eq $l2.Body){'PASS'}else{'FAIL'}); Notes="l1=$($l1.StatusCode) l2=$($l2.StatusCode)"; Status=$l1.StatusCode }
$results += [pscustomobject]@{ Test='login no user-enumeration message diff'; Result=$(if($l1.Body -match 'Invalid email or password'){ if($l1.Body -eq $l2.Body){'PASS'}else{'FAIL'} }else{'FAIL'}); Notes=$l1.Body; Status=$l1.StatusCode }

# 6. Security headers present, CORS absent
$r = Req 'GET' '/'
$h = $r.Headers
function Get-Hdr($headers, $key) {
  $v = $headers[$key]
  if ($v -is [array]) { return ($v -join ',') }
  return $v
}
$checks = @(
  @{n='X-Content-Type-Options'; v=(Get-Hdr $h 'X-Content-Type-Options')},
  @{n='X-Frame-Options'; v=(Get-Hdr $h 'X-Frame-Options')},
  @{n='Strict-Transport-Security'; v=(Get-Hdr $h 'Strict-Transport-Security')},
  @{n='Content-Security-Policy'; v=(Get-Hdr $h 'Content-Security-Policy')},
  @{n='Referrer-Policy'; v=(Get-Hdr $h 'Referrer-Policy')}
)
foreach ($c in $checks) {
  $ok = -not [string]::IsNullOrEmpty($c.v)
  $results += [pscustomobject]@{ Test="header $($c.n)"; Result=$(if($ok){'PASS'}else{'FAIL'}); Notes=$c.v; Status=$r.StatusCode }
}
$cors = Get-Hdr $h 'Access-Control-Allow-Origin'
$results += [pscustomobject]@{ Test='no Access-Control-Allow-Origin'; Result=$(if([string]::IsNullOrEmpty($cors)){ if ($r.Headers.Keys -contains 'Access-Control-Allow-Origin') {'FAIL'} else {'PASS'} }else{'FAIL'}); Notes=$cors; Status=$r.StatusCode }

# 7. Admin page shell (env flag admin)
$a = Req 'GET' '/admin'
$results += [pscustomobject]@{ Test='/admin reachable (client-gated shell)'; Result=$(if($a.StatusCode -eq 200){'PASS'}else{'FAIL'}); Notes="status=$($a.StatusCode)"; Status=$a.StatusCode }
$embeddedPii = ($a.Body -match 'patient_name|contact_number')
$results += [pscustomobject]@{ Test='/admin HTML embeds no PII'; Result=$(if($embeddedPii){'FAIL'}else{'PASS'}); Notes=''; Status=$a.StatusCode }

# 8. CSP contents
$csp = Get-Hdr $h 'Content-Security-Policy'
$results += [pscustomobject]@{ Test='CSP has unsafe-eval (KNOWN GAP pre-fix)'; Result='INFO'; Notes=$(if($csp -match "unsafe-eval"){'present'}else{'absent'}); Status=$r.StatusCode }
$results += [pscustomobject]@{ Test='CSP has unsafe-inline in script-src (KNOWN GAP pre-fix)'; Result='INFO'; Notes=$(if($csp -match "script-src[^;]*unsafe-inline"){'present'}else{'absent'}); Status=$r.StatusCode }

$results | Format-Table -AutoSize -Wrap
$results | Export-Csv -NoTypeInformation baseline-test-results.csv
Write-Output "`nPASS: $(( $results | Where-Object Result -eq 'PASS').Count)  FAIL: $(( $results | Where-Object Result -eq 'FAIL').Count)  INFO: $(( $results | Where-Object Result -eq 'INFO').Count)"
