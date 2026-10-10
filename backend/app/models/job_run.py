"""JobRun: 백그라운드(cron) 잡 실행 원장.

worker 의 recorded() 러너가 잡마다: 시작 시 status=running 로 INSERT,
종료 시 ok/failed 로 UPDATE (started/finished 두 번 쓰기). 시작했는데 안 끝난
잡(워커 크래시·행)은 running 으로 박제돼 보임 → 관측·liveness·실패 추적의 단일 소스.

시스템 전역 잡이라 워크스페이스 스코프 없음. 오래된 row 는 purge_expired_job_runs 가 정리.
"""

from datetime import datetime

from sqlalchemy import DateTime, Index, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class JobRun(Base):
    __tablename__ = "job_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    # 잡 이름 (recorded() 에 넘긴 값): trash_purge / heartbeat 등
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    # running(시작) → ok | failed(종료)
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    # 도는 중엔 null
    finished_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # 잡이 반환한 처리 건수
    item_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # 실패 시 예외 repr
    error: Mapped[str | None] = mapped_column(Text, nullable=True)

    # "잡별 최신 실행" 조회용: (name, started_at)
    __table_args__ = (Index("ix_job_runs_name_started_at", "name", "started_at"),)
