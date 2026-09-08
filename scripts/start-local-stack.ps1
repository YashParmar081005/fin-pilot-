# Start FinPilot's dependencies WITHOUT Docker.
#
# docker-compose.yml remains the intended path. This exists because Docker
# Desktop cannot start its VM on a machine where com.docker.service is not
# running and cannot be started without administrator rights — the app then
# has no Mongo and no Redis and nothing works. Both services below are the
# same versions compose would give you:
#
#   mongod  : a ONE-NODE REPLICA SET on 27018 (transactions need a replica
#             set — see CLAUDE.md; a standalone mongod cannot start a session)
#   redis   : inside WSL on 6380, reachable from Windows via localhost
#
# MinIO and Mailhog are deliberately not started: S3 is not wired (documents
# are stored in Mongo) and mail failures are swallowed by design, so neither
# blocks the app.
#
# Usage:  powershell -ExecutionPolicy Bypass -File scripts\start-local-stack.ps1

$ErrorActionPreference = 'Stop'

$MongoBin = 'C:\Program Files\MongoDB\Server\8.0\bin\mongod.exe'
$MongoSh = 'C:\Program Files\mongosh\mongosh.exe'
$DataDir = 'D:\finpilot-data\mongo'   # NTFS: the E: project drive is FAT32
$LogDir = 'D:\finpilot-data\logs'
$Distro = 'Ubuntu-24.04'

function Test-Port($port) {
  [bool](Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)
}

# ── Mongo ───────────────────────────────────────────────────────────────────
if (Test-Port 27018) {
  Write-Host 'mongod already listening on 27018' -ForegroundColor DarkGray
}
else {
  New-Item -ItemType Directory -Path $DataDir, $LogDir -Force | Out-Null
  Start-Process -FilePath $MongoBin -WindowStyle Hidden -ArgumentList @(
    '--replSet', 'rs0', '--port', '27018', '--dbpath', $DataDir,
    '--bind_ip', '127.0.0.1', '--logpath', "$LogDir\mongod.log", '--logappend'
  )
  for ($i = 0; $i -lt 30; $i++) { Start-Sleep -Seconds 2; if (Test-Port 27018) { break } }
  if (-not (Test-Port 27018)) { throw "mongod did not start — see $LogDir\mongod.log" }
  Write-Host 'mongod started on 27018' -ForegroundColor Green
}

# rs.initiate() is idempotent here: it only runs when there is no config yet.
& $MongoSh --port 27018 --quiet --eval @'
try { rs.status() } catch (e) {
  rs.initiate({ _id: 'rs0', members: [{ _id: 0, host: '127.0.0.1:27018' }] })
}
'@ | Out-Null
$state = & $MongoSh --port 27018 --quiet --eval "rs.status().members[0].stateStr"
Write-Host "replica set state: $state" -ForegroundColor Green

# ── Redis ───────────────────────────────────────────────────────────────────
if (Test-Port 6380) {
  Write-Host 'redis already listening on 6380' -ForegroundColor DarkGray
}
else {
  # --bind 0.0.0.0 so Windows can reach it through WSL's localhost forwarding.
  wsl -d $Distro -u root -- bash -lc `
    "redis-server --port 6380 --bind 0.0.0.0 --protected-mode no --daemonize yes --save '' --appendonly no" | Out-Null
  Start-Sleep -Seconds 2
  Write-Host 'redis started on 6380' -ForegroundColor Green
}

$pong = wsl -d $Distro -u root -- redis-cli -p 6380 ping
Write-Host "redis says: $pong" -ForegroundColor Green

Write-Host ''
Write-Host 'Dependencies are up. Next:' -ForegroundColor Cyan
Write-Host '  pnpm --filter @finpilot/api dev        # API :4000 + worker'
Write-Host '  pnpm --filter @finpilot/web dev        # web :5180'
Write-Host '  pnpm --filter @finpilot/api seed:demo  # realistic demo books'
