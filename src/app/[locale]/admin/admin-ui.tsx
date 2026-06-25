'use client'

import * as React from 'react'
import type { ReactNode } from 'react'

export function adminInputClass() {
  return 'w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-100'
}

export function AdminStatusPill({ status }: { status: string }) {
  const tone = status === 'active' || status === 'ok' || status === 'published' || status === 'enabled'
    ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
    : status === 'paused' || status === 'maintenance' || status === 'queued' || status === 'warning'
      ? 'bg-amber-100 text-amber-800 border-amber-200'
      : status === 'disabled' || status === 'failed' || status === 'critical' || status === 'error'
        ? 'bg-rose-100 text-rose-800 border-rose-200'
        : 'bg-slate-100 text-slate-700 border-slate-200'

  return (
    <span className={`inline-flex h-6 items-center rounded border px-2 text-xs font-medium ${tone}`}>
      {status}
    </span>
  )
}

export function AdminSelect(props: {
  label: string
  value: string
  options: Array<{ value: string; label: string }>
  onChange: (value: string) => void
}) {
  return (
    <div className="grid gap-1 text-xs font-medium text-slate-600">
      <span>{props.label}</span>
      <select
        className="h-9 rounded border border-slate-300 bg-white px-2 text-sm text-slate-950 shadow-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      >
        {props.options.map(option => (
          <option key={option.value} value={option.value} className="bg-white text-slate-950">
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}

export function AdminButton(props: {
  children: ReactNode
  onClick?: () => void
  type?: 'button' | 'submit'
  danger?: boolean
  secondary?: boolean
  disabled?: boolean
}) {
  const tone = props.danger
    ? 'bg-rose-600 text-white hover:bg-rose-700'
    : props.secondary
      ? 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
      : 'bg-slate-900 text-white hover:bg-slate-800'

  return (
    <button
      type={props.type || 'button'}
      disabled={props.disabled}
      onClick={props.onClick}
      className={`inline-flex h-9 items-center justify-center rounded px-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 ${tone}`}
    >
      {props.children}
    </button>
  )
}

export function AdminConfirmDialog(props: {
  open: boolean
  title: string
  reason: string
  confirmLabel: string
  danger?: boolean
  onReasonChange: (value: string) => void
  onCancel: () => void
  onConfirm: () => void
}) {
  if (!props.open) return null
  const disabled = props.reason.trim().length < 3

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded border border-slate-200 bg-white p-4 shadow-xl">
        <h2 className="text-base font-semibold text-slate-950">{props.title}</h2>
        <label className="mt-4 grid gap-1 text-sm text-slate-700">
          原因
          <textarea
            value={props.reason}
            onChange={(event) => props.onReasonChange(event.target.value)}
            className={`${adminInputClass()} min-h-24`}
          />
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <AdminButton secondary onClick={props.onCancel}>取消</AdminButton>
          <AdminButton danger={props.danger} disabled={disabled} onClick={props.onConfirm}>
            {props.confirmLabel}
          </AdminButton>
        </div>
      </div>
    </div>
  )
}
