import type { ReactNode } from 'react';

/** 마켓 탭 본문: 제목과 한 줄 설명 아래에 탭 내용을 둔다. */
export default function TabSection({
  title,
  subtitle,
  children,
}: {
  title: ReactNode;
  subtitle: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="mt-8">
      <h2 className="mb-0.5 text-[22px] font-bold text-text-primary">{title}</h2>
      <div className="mb-3.5 text-[13.5px] text-text-muted">{subtitle}</div>
      {children}
    </section>
  );
}
