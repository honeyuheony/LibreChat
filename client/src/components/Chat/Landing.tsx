import { useRecoilValue } from 'recoil';
import { HatGlasses } from 'lucide-react';
import { useLocalize, useAuthContext, useGreeting } from '~/hooks';
import { daypartGreetingSchedule } from '~/utils/greeting';
import BrandMark from '~/components/ui/BrandMark';
import temporaryStore from '~/store/temporary';
import { cn } from '~/utils';

/** 한국어 전체 이름에는 성을 빼고 이름으로 인사한다. */
export const greetingName = (name?: string) =>
  name != null && /^[가-힣]{3,4}$/.test(name) ? name.slice(1) : name;

export default function Landing({ centerFormOnLanding }: { centerFormOnLanding: boolean }) {
  const { user } = useAuthContext();
  const localize = useLocalize();
  const isTemporary = useRecoilValue(temporaryStore.isTemporary);
  const greeting = useGreeting(greetingName(user?.name), '', daypartGreetingSchedule);
  const heading = isTemporary ? localize('com_ui_temporary') : greeting;

  return (
    <div
      className={cn(
        'flex h-full transform-gpu flex-col items-center justify-center pb-8 transition-all duration-200',
        centerFormOnLanding ? 'max-h-full sm:max-h-0' : 'max-h-full',
      )}
    >
      <div className="flex flex-col items-center gap-3 px-4">
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:gap-3">
          {isTemporary ? (
            <HatGlasses className="size-8 flex-shrink-0 text-text-primary" aria-hidden="true" />
          ) : (
            <BrandMark className="size-9" />
          )}
          <h2 className="animate-fadeIn text-balance break-keep text-center text-3xl font-bold leading-tight tracking-[-0.03em] text-text-primary sm:text-[31px]">
            {heading}
          </h2>
        </div>
        {isTemporary && (
          <p className="animate-fadeIn max-w-md text-center text-sm text-text-secondary">
            {localize('com_ui_temporary_description')}
          </p>
        )}
      </div>
    </div>
  );
}
