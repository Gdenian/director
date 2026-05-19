import React from 'react'

export type LoadingBorderFlowProps = {
  className?: string
  trackClassName?: string
  traceClassName?: string
  primaryClassName?: string
  secondaryClassName?: string
}

function mergeClassNames(...classNames: Array<string | undefined>): string | undefined {
  const merged = classNames.filter(Boolean).join(' ')
  return merged.length > 0 ? merged : undefined
}

export function LoadingBorderFlow({
  className,
  trackClassName,
  traceClassName,
  primaryClassName,
  secondaryClassName,
}: LoadingBorderFlowProps) {
  return (
    <svg className={className} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <rect className={trackClassName} x="2" y="2" width="96" height="96" rx="4" pathLength="100" />
      <rect
        className={mergeClassNames(traceClassName, primaryClassName)}
        x="2"
        y="2"
        width="96"
        height="96"
        rx="4"
        pathLength="100"
      />
      <rect
        className={mergeClassNames(traceClassName, secondaryClassName)}
        x="2"
        y="2"
        width="96"
        height="96"
        rx="4"
        pathLength="100"
      />
    </svg>
  )
}
