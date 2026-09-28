/** 대화 헤더와 페이지 상단 막대가 함께 쓰는 반투명 재질이다. 아래 경계는 선 대신 1px 그림자로 긋는다. */
export const topBarSurfaceClassName =
  'bg-presentation/70 shadow-[0_1px_0] shadow-border-light/60 backdrop-blur-[20px] backdrop-saturate-[1.8]';

/** 라이브러리·설정·데이터 허브·지표 페이지가 함께 쓰는 상단 막대 스타일이다. */
export const pageTopBarClassName = `sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 px-6 text-[14.5px] text-text-secondary ${topBarSurfaceClassName}`;

/** 상단 막대 아래 페이지 제목까지의 여백이다. 제목 위치가 페이지마다 달라지지 않게 한곳에서 정한다. */
export const pageTitleTopClassName = 'pt-[18px]';
