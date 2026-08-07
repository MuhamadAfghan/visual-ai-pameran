# sync-proto.ps1
# Salin ai/proto/inference.proto ke backend-web/proto/ai/v1/inference.proto
# Source of truth: ai/proto/inference.proto (AI service yang memiliki kontrak gRPC)
#
# Jalankan script ini setiap kali inference.proto diubah:
#   .\sync-proto.ps1
#
# Setelah sync, generate ulang Python stubs di ai/:
#   cd ai && scripts\gen_proto.ps1

$Root      = Split-Path -Parent $MyInvocation.MyCommand.Path
$Source    = Join-Path $Root "ai\proto\ai\v1\inference.proto"
$Target    = Join-Path $Root "backend-web\proto\ai\v1\inference.proto"

if (-not (Test-Path $Source)) {
    Write-Error "Source not found: $Source"
    exit 1
}

Copy-Item -Path $Source -Destination $Target -Force
Write-Host "Synced: ai/proto/inference.proto -> backend-web/proto/ai/v1/inference.proto"

# Verify no diff
$diff = Compare-Object (Get-Content $Source) (Get-Content $Target)
if ($diff) {
    Write-Error "Sync verification failed - files still differ."
    exit 1
}
Write-Host "Verification OK - both files are identical."
