#!/bin/sh
# 운영 서버 처음 한 번: 배포 디렉터리를 GitHub 체크아웃으로 바꾼다. 서버 ssh 키(~/.ssh/id_ed25519)가
# 레포 소유 GitHub 계정에 등록돼 있어야 한다 (없으면 키를 만들고 공개 키를 출력한다).
# 로컬 make deploy-git-init 이 ssh 표준입력으로 넘겨 실행한다 (서버에 저장소가 없어도 된다). docs/deploy.md
# .env.prod, backups/, .secrets/ 같은 추적하지 않는 파일은 건드리지 않는다. 여러 번 실행해도 된다.
#
#   sh -s -- <owner/repo> <배포 디렉터리>
set -eu
SLUG=$1
DIR=$2
KEY=$HOME/.ssh/id_ed25519
# GitHub 공식 ed25519 호스트 키 지문 (api.github.com/meta 의 ssh_key_fingerprints)
GITHUB_FP=SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU

command -v git >/dev/null || { echo "! git 없음: sudo apt install git"; exit 1; }

mkdir -p "$HOME/.ssh" && chmod 700 "$HOME/.ssh"
[ -f "$KEY" ] || ssh-keygen -q -t ed25519 -N "" -C "$(hostname)" -f "$KEY"
if ! ssh-keygen -F github.com -f "$HOME/.ssh/known_hosts" >/dev/null 2>&1; then
  tmp=$(mktemp)
  ssh-keyscan -t ed25519 github.com > "$tmp" 2>/dev/null
  fp=$(ssh-keygen -lf "$tmp" | awk '{print $2}')
  [ "$fp" = "$GITHUB_FP" ] || { rm -f "$tmp"; echo "! github.com 호스트 키 지문이 다릅니다: $fp"; exit 1; }
  cat "$tmp" >> "$HOME/.ssh/known_hosts"
  rm -f "$tmp"
fi

mkdir -p "$DIR"
cd "$DIR"
if [ ! -d .git ]; then
  git init -q -b main
  git remote add origin "git@github.com:$SLUG.git"
fi
if ! git fetch -q origin main 2>/dev/null; then
  echo "! GitHub 에서 받지 못했습니다. 아래 서버 공개 키를 ${SLUG%%/*} 계정 Settings > SSH keys 에"
  echo "  등록한 뒤 다시 실행하세요."
  echo
  cat "$KEY.pub"
  exit 1
fi
git checkout -q -f -B main origin/main
git log -1 --format="→ %h %s"
