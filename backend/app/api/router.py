"""모든 라우터 등록: main.py가 한 번에 include.

"""

from fastapi import APIRouter

from app.api.v1 import (
    activity,
    admin_companies,
    admin_jobs,
    admin_smtp,
    audit,
    company,
    company_members,
    company_quota,
    company_smtp,
    e2e,
    file_versions,
    groups,
    me,
    nodes,
    notifications,
    search,
    team_folders,
    webhooks,
)

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(me.router, tags=["auth"])
api_router.include_router(nodes.router)
api_router.include_router(file_versions.router)
api_router.include_router(audit.router)
api_router.include_router(notifications.router)
api_router.include_router(webhooks.router)
api_router.include_router(search.router)
api_router.include_router(activity.router)
api_router.include_router(company.router)
api_router.include_router(admin_companies.router)
api_router.include_router(admin_jobs.router)
api_router.include_router(admin_smtp.router)
api_router.include_router(company_smtp.router)
api_router.include_router(company_members.router)
api_router.include_router(company_quota.view_router)
api_router.include_router(company_quota.admin_router)
api_router.include_router(e2e.router)
api_router.include_router(groups.router)
api_router.include_router(team_folders.router)
