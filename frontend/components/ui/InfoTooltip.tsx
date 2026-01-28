import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type Side = 'top' | 'bottom';

export interface InfoTooltipProps {
  content: React.ReactNode;
  /** 툴팁 위치 (기본: top) */
  side?: Side;
  /** 아이콘(ⓘ) 크기 */
  sizePx?: number;
  /** 아이콘 색상 클래스 */
  className?: string;
  /** 접근성 라벨 */
  ariaLabel?: string;
}

export const InfoTooltip: React.FC<InfoTooltipProps> = ({
  content,
  side = 'top',
  sizePx = 16,
  className = 'text-slate-400 hover:text-slate-700',
  ariaLabel = '설명 보기',
}) => {
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 0 });
  const [fixedPos, setFixedPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 });

  const fontSize = useMemo(() => Math.max(11, Math.floor(sizePx * 0.75)), [sizePx]);

  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

  const updatePosition = () => {
    const el = anchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos({ top: rect.top, left: rect.left, width: rect.width });
  };

  const updateFixedPosition = () => {
    const margin = 12;
    const vw = typeof window !== 'undefined' ? window.innerWidth : 360;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 640;

    const desiredLeft = pos.left + pos.width / 2;
    const desiredTop = side === 'bottom' ? pos.top + sizePx + 10 : pos.top - 10; // top은 transform에서 보정되므로 여긴 앵커 기준선

    // 툴팁 실제 크기 기준으로 화면 안에 들어오게 클램프
    const tooltipEl = tooltipRef.current;
    const tw = tooltipEl?.offsetWidth ?? 320;
    const th = tooltipEl?.offsetHeight ?? 60;

    // 현재 구현은 x는 가운데 기준, y는 side에 따라 위/아래로 배치
    const left = clamp(desiredLeft, margin + tw / 2, vw - margin - tw / 2);

    // y는 top/bottom에 따라 기준이 달라서, 최종 top을 계산
    const top =
      side === 'bottom'
        ? clamp(pos.top + sizePx + 10, margin, vh - margin - th)
        : clamp(pos.top - 10 - th, margin, vh - margin - th);

    setFixedPos({ left, top });
  };

  useEffect(() => {
    if (!open) return;
    updatePosition();
    // 첫 렌더 후 실제 크기 반영
    requestAnimationFrame(() => updateFixedPosition());

    const onScroll = () => updatePosition();
    const onResize = () => updatePosition();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    updateFixedPosition();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pos.top, pos.left, pos.width, side, sizePx]);

  return (
    <span className="inline-flex align-middle">
      <span
        ref={anchorRef}
        role="img"
        aria-label={ariaLabel}
        tabIndex={0}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className={`inline-flex items-center justify-center select-none rounded-full border border-slate-200 bg-white ${className}`}
        style={{ width: sizePx, height: sizePx, fontSize }}
      >
        ⓘ
      </span>

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed z-[9999] pointer-events-none"
            style={{
              left: fixedPos.left,
              top: fixedPos.top,
              transform: 'translate(-50%, 0)',
            }}
          >
            <div
              ref={tooltipRef}
              className="pointer-events-auto whitespace-normal rounded-xl border border-slate-200 bg-white px-3 py-2 text-[12px] leading-relaxed text-slate-700 shadow-[0_8px_24px_rgba(15,23,42,0.12)]"
              style={{ maxWidth: Math.min(320, (typeof window !== 'undefined' ? window.innerWidth : 360) - 24) }}
            >
              {content}
            </div>
          </div>,
          document.body
        )}
    </span>
  );
};

