import { useRecoilValue } from 'recoil';
import { HatGlasses } from 'lucide-react';
import { useLocalize, useAuthContext, useGreeting } from '~/hooks';
import { daypartGreetingSchedule } from '~/utils/greeting';
import BrandMark from '~/components/ui/BrandMark';
import temporaryStore from '~/store/temporary';
import { cn } from '~/utils';

/** The empty conversation's heading: a greeting for the time of day, or the temporary-chat notice. */
export default function Landing({ centerFormOnLanding }: { centerFormOnLanding: boolean }) {
  const { user } = useAuthContext();
  const localize = useLocalize();
  const isTemporary = useRecoilValue(temporaryStore.isTemporary);
  const greeting = useGreeting(user?.name, '', daypartGreetingSchedule);
  const heading = isTemporary ? localize('com_ui_temporary') : greeting;

  return (
    <div
      className={cn(
        'flex h-full transform-gpu flex-col items-center justify-center pb-8 transition-all duration-200',
        centerFormOnLanding ? 'max-h-full sm:max-h-0' : 'max-h-full',
      )}
    >
      <div className="flex flex-col items-center gap-3 px-4">
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:gap-3.5">
          {isTemporary ? (
            <HatGlasses className="size-8 flex-shrink-0 text-text-primary" aria-hidden="true" />
          ) : (
            <BrandMark className="size-8" />
          )}
          <h2 className="animate-fadeIn text-balance break-keep text-center font-serif text-3xl font-medium leading-tight tracking-[-0.02em] text-text-primary sm:text-[2.375rem]">
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
