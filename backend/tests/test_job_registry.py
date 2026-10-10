"""cron 잡 등록표(registry.JOBS) 정합성: 스케줄이 데이터라 테스트 가능(#4).

worker 가 이 등록표로 cron 을 만들고 admin 엔드포인트가 읽으므로, 이름 유일성,
스케줄 표기, worker 반영을 회귀로 못 박는다.
"""

from app.jobs.registry import JOBS
from app.jobs.worker import WorkerSettings


def test_job_names_unique():
    names = [s.name for s in JOBS]
    assert len(names) == len(set(names))


def test_every_job_has_schedule_and_cron_kwargs():
    for spec in JOBS:
        assert spec.schedule, f"{spec.name} 스케줄 설명 누락"
        assert spec.cron_kwargs, f"{spec.name} cron_kwargs 누락"
        assert callable(spec.fn)


def test_worker_registers_every_job():
    # worker cron_jobs 는 registry 단일 소스에서 생성: 개수 일치
    assert len(WorkerSettings.cron_jobs) == len(JOBS)
