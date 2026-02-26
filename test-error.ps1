$c = Get-Content 'C:\Users\songl\.openclaw\openclaw.json' -Raw
$c = $c -replace '"gateway"', '"gateway_test_error"'
Set-Content -Path 'C:\Users\songl\.openclaw\openclaw.json' -Value $c
