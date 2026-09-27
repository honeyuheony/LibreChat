import { Check } from 'lucide-react';
import type { TranslationKeys } from '~/hooks';
import type { TodoItem } from './state';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

const TODO_KEY: Record<TodoItem['key'], TranslationKeys> = {
  text: 'com_skills_builder_todo_text',
  minutes: 'com_skills_builder_todo_minutes',
  test: 'com_skills_builder_todo_test',
};

/** 게시 조건 목록. 모두 체크되어야 게시 단추가 켜진다. */
export default function Todo({ items }: { items: TodoItem[] }) {
  const localize = useLocalize();
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <li
          key={item.key}
          data-done={item.done}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[12.5px]',
            item.done
              ? 'border-status-success-border text-status-success'
              : 'border-border-light text-text-tertiary',
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              'inline-flex size-3.5 items-center justify-center rounded-full border',
              item.done
                ? 'border-transparent bg-status-success text-text-on-status'
                : 'border-border-medium',
            )}
          >
            {item.done && <Check className="size-2.5" />}
          </span>
          <span>{localize(TODO_KEY[item.key])}</span>
        </li>
      ))}
    </ul>
  );
}
