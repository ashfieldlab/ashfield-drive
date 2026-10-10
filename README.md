<div align="center">

<img src="frontend/public/icons/ashfield/ashfield-mark.svg" width="72" alt="Ashfield" />

# Ashfield Drive

워크스페이스를 위한 파일 저장소

[![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=flat-square&logo=nextdotjs&logoColor=white)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Python](https://img.shields.io/badge/Python-3.14-3776AB?style=flat-square&logo=python&logoColor=white)](https://www.python.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=flat-square&logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![S3](https://img.shields.io/badge/S3-compatible-569A31?style=flat-square&logo=amazons3&logoColor=white)](#)
[![License: MIT](https://img.shields.io/badge/License-MIT-lightgrey?style=flat-square)](LICENSE)

</div>

개인 파일과 팀 공유 파일을 한곳에 두고, 필요한 만큼만 나눕니다.

- **파일과 폴더**: 대용량 업로드, 휴지통, 버전 기록, 검색
- **공유**: 멤버와 공유하거나 만료, 비밀번호가 있는 외부 링크로
- **잠긴 폴더**: 서버도 열어볼 수 없는 종단간 암호화 폴더
- **데스크톱 동기화**: [Ashfield Sync](https://github.com/ashfieldlab/ashfield-sync) 로 Windows 탐색기에서 바로

## 시작하기

Node 24+, Python 3.14, Docker 가 필요합니다. [Ashfield Account](https://github.com/ashfieldlab/ashfield-account) 를 먼저 띄워 주세요.

```bash
make setup   # 의존성 설치, 인프라 기동, DB 준비
make dev     # http://localhost:3200
```

## 문서

- [로컬 개발](docs/local-dev.md): 환경 변수, 포트, 테스트
- [도메인 용어](CONTEXT.md)
- [설계 결정](docs/adr/)

## Ashfield

| | |
|---|---|
| [Account](https://github.com/ashfieldlab/ashfield-account) | 계정, 워크스페이스 |
| [Calendar](https://github.com/ashfieldlab/ashfield-calendar) | 일정, 회의실, 예약 |
| [Drive](https://github.com/ashfieldlab/ashfield-drive) | 파일 저장, 공유 |
| [Sync](https://github.com/ashfieldlab/ashfield-sync) | Drive 데스크톱 동기화 (Windows) |

## 라이선스

MIT
