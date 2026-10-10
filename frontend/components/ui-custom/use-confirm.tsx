"use client"

/**
 * 전역 확인 다이얼로그: native confirm() 드롭인 대체 (shadcn/ui AlertDialog 기반).
 *
 * 토스트(<Toaster />)와 같은 UI 프리미티브 성격의 provider: 앱 도메인
 * 상태가 아니라 명령형 UI 유틸. layout 에 ConfirmProvider 1회 마운트.
 *
 * 사용:
 *   const confirm = useConfirm()
 *   if (!(await confirm({ title: "삭제할까요?", variant: "destructive" }))) return
 */

import { createContext, useCallback, useContext, useRef, useState } from "react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

interface ConfirmOptions {
  title: string
  description?: string
  confirmText?: string
  cancelText?: string
  variant?: "default" | "destructive"
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn | null>(null)

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null)
  const resolverRef = useRef<((v: boolean) => void) | null>(null)

  const confirm = useCallback<ConfirmFn>((o) => {
    // 이전 확인 창이 아직 열려 있으면 취소로 정리 (Promise 가 매달린 채 남지 않도록)
    resolverRef.current?.(false)
    setOpts(o)
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve
    })
  }, [])

  const settle = useCallback((value: boolean) => {
    resolverRef.current?.(value)
    resolverRef.current = null
    setOpts(null)
  }, [])

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {opts && (
        <AlertDialog
          open
          onOpenChange={(open) => {
            if (!open) settle(false)
          }}
        >
          {/* 앱 모달(z-50~60), 시스템 배너(z-150) 위에서 열릴 수 있어 z-index 를 올린다. */}
          <AlertDialogContent
            className="z-[200]"
            overlayClassName="z-[200]"
            data-testid="confirm-dialog"
          >
            <AlertDialogHeader>
              <AlertDialogTitle>{opts.title}</AlertDialogTitle>
              {opts.description && (
                <AlertDialogDescription>{opts.description}</AlertDialogDescription>
              )}
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel
                onClick={() => settle(false)}
                data-testid="confirm-dialog-cancel"
              >
                {opts.cancelText ?? "취소"}
              </AlertDialogCancel>
              <AlertDialogAction
                variant={opts.variant === "destructive" ? "destructive" : "default"}
                onClick={() => settle(true)}
                data-testid="confirm-dialog-confirm"
              >
                {opts.confirmText ?? "확인"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </ConfirmContext.Provider>
  )
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error("useConfirm 는 ConfirmProvider 안에서만 사용")
  return ctx
}
