"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

interface ProgressProps {
  value?: number
  className?: string
  color?: string
}

const Progress = React.forwardRef<
  HTMLDivElement,
  ProgressProps
>(({ className, value = 0, color, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "relative h-4 w-full overflow-hidden rounded-full bg-gray-200",
      className
    )}
    {...props}
  >
    <div
      className={cn(
        "h-full w-full flex-1 transition-all rounded-full",
        color || "bg-blue-600"
      )}
      style={{ 
        width: `${Math.min(Math.max(value, 0), 100)}%`,
        transition: 'width 0.3s ease-in-out'
      }}
    />
  </div>
))
Progress.displayName = "Progress"

export { Progress }