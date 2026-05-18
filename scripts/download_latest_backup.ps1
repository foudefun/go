param(
  [string]$HostName = "go.foudefun.ch",
  [string]$User = "deploy",
  [string]$KeyPath = "$HOME\.ssh\go_actions_deploy_ed25519",
  [string]$RemoteBackupDir = "/opt/rehab/backups",
  [string]$LocalBackupDir = "$HOME\rehab-backups"
)

$ErrorActionPreference = "Stop"

New-Item -ItemType Directory -Force -Path $LocalBackupDir | Out-Null

$latest = ssh -i $KeyPath "$User@$HostName" "set -euo pipefail; ls -t $RemoteBackupDir/rehab-backup-*.tar.gz | head -1"
$latest = [string]$latest.Trim()
if (-not $latest) {
  throw "No remote backup found in $RemoteBackupDir"
}

$target = Join-Path $LocalBackupDir (Split-Path $latest -Leaf)
scp -i $KeyPath "$User@$HostName`:$latest" $target

Get-Item $target | Select-Object FullName, Length, LastWriteTime
