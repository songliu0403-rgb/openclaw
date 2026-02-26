$c = Get-Content 'Z:\Local\Users\songl\.openclaw\openclaw.json' -Raw
$c = $c -replace '"gateway":', '"gateway ERROR":'
Set-Content -Path 'Z:\Local\Users\songl\.openclaw\openclaw.json' -Value $c
