"use client";

import { TOTAL_STEPS } from "@/types";
import { cn } from "@/lib/utils";

interface ProgressBarProps {
  currentStep: number;
  /** Override the total number of steps (defaults to TOTAL_STEPS = 8) */
  totalSteps?: number;
  label?: string;
  className?: string;
}

export function ProgressBar({ currentStep, totalSteps = TOTAL_STEPS, label, className }: ProgressBarProps) {
  const progress = (currentStep / totalSteps) * 100;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex justify-between items-end">
        <span className="text-xs font-bold text-primary uppercase tracking-wider font-label">
          Passo {currentStep} de {totalSteps}
        </span>
        {label && (
          <span className="text-xs text-outline-variant font-medium font-label">
            {label}
          </span>
        )}
      </div>
      <div className="progress-track">
        <div
          className="progress-fill"
          style={{ width: `${progress}%` }}
          role="progressbar"
          aria-valuenow={currentStep}
          aria-valuemin={1}
          aria-valuemax={totalSteps}
        />
      </div>
    </div>
  );
}

// Default export for pages that import without braces
export default ProgressBar;
