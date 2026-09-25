import type { GreetingSlot } from '../greeting';
import {
  dayKeys,
  getGreetingKey,
  getGreetingSlot,
  getGreetingOption,
  greetingSlotsByDay,
  defaultGreetingSlots,
  getMsUntilNextGreeting,
  getDaypart,
  getDaypartGreetingKey,
  getMsUntilNextDaypart,
} from '../greeting';
import translationKo from '~/locales/ko/translation.json';
import translationEn from '~/locales/en/translation.json';

/** 2024-01-07 is a Sunday, so index 0..6 maps directly onto sun..sat. */
const dateForDay = (dayIndex: number, hours: number, minutes = 0, seconds = 0) =>
  new Date(2024, 0, 7 + dayIndex, hours, minutes, seconds, 0);

const slotsFor = (dayIndex: number) =>
  greetingSlotsByDay[dayKeys[dayIndex]] ?? defaultGreetingSlots;

const allSlots: GreetingSlot[] = [
  ...defaultGreetingSlots,
  ...Object.values(greetingSlotsByDay).flatMap((slots) => slots ?? []),
];

const textFor = (key: string) => translationEn[key as keyof typeof translationEn];

describe('greeting schedule', () => {
  it('references translation keys that exist in the English catalog', () => {
    allSlots.forEach((slot) => {
      slot.options.forEach((option) => {
        expect(translationEn).toHaveProperty(option.key);
        expect(translationEn).toHaveProperty(option.namedKey);
      });
    });
  });

  /** Every variant must greet a signed-in user by name, at every hour of every day. */
  it('pairs every variant with a personalized form', () => {
    allSlots.forEach((slot) => {
      expect(slot.options.length).toBeGreaterThan(0);
      slot.options.forEach((option) => {
        expect(textFor(option.namedKey)).toContain('{{name}}');
        expect(textFor(option.key)).not.toContain('{{name}}');
      });
    });
  });

  /** Matches the 56-character cutoff in Landing's getTextSizeClass. */
  it('keeps every variant within the landing large-text budget for a long name', () => {
    allSlots.forEach((slot) => {
      slot.options.forEach((option) => {
        const rendered = textFor(option.namedKey).replace('{{name}}', 'Alexandra Kowalski');
        expect(rendered.length).toBeLessThan(56);
      });
    });
  });
});

describe('getGreetingSlot', () => {
  it('maps each weekday to its own schedule', () => {
    dayKeys.forEach((_key, index) => {
      expect(dateForDay(index, 12).getDay()).toBe(index);
      expect(getGreetingSlot(dateForDay(index, 12))).toBe(slotsFor(index)[3]);
    });
  });

  it('falls back to the default schedule on Tuesday', () => {
    expect(greetingSlotsByDay.tue).toBeUndefined();
    expect(dateForDay(2, 9).getDay()).toBe(2);
    defaultGreetingSlots.forEach((slot, index) => {
      const hour = index === 0 ? 0 : defaultGreetingSlots[index - 1].until;
      expect(getGreetingSlot(dateForDay(2, hour))).toBe(slot);
    });
  });

  it('selects the first slot whose `until` exceeds the hour, for every boundary', () => {
    dayKeys.forEach((_key, dayIndex) => {
      const slots = slotsFor(dayIndex);
      slots.forEach((slot, slotIndex) => {
        const start = slotIndex === 0 ? 0 : slots[slotIndex - 1].until;
        expect(getGreetingSlot(dateForDay(dayIndex, start))).toBe(slot);
        expect(getGreetingSlot(dateForDay(dayIndex, slot.until - 1, 59, 59))).toBe(slot);
      });
    });
  });

  it.each([
    [0, 0],
    [3, 0],
    [4, 1],
    [5, 1],
    [6, 1],
    [7, 2],
    [11, 2],
    [12, 3],
    [16, 3],
    [17, 4],
    [21, 4],
    [22, 5],
    [23, 5],
  ])('resolves hour %i to slot index %i on every day', (hour, slotIndex) => {
    dayKeys.forEach((_key, dayIndex) => {
      expect(getGreetingSlot(dateForDay(dayIndex, hour))).toBe(slotsFor(dayIndex)[slotIndex]);
    });
  });
});

describe('getGreetingOption', () => {
  it('holds the same variant for every hour within a slot', () => {
    dayKeys.forEach((_key, dayIndex) => {
      const slots = slotsFor(dayIndex);
      slots.forEach((slot, slotIndex) => {
        const start = slotIndex === 0 ? 0 : slots[slotIndex - 1].until;
        const expected = getGreetingOption(dateForDay(dayIndex, start));
        for (let hour = start; hour < slot.until; hour++) {
          expect(getGreetingOption(dateForDay(dayIndex, hour, 30))).toBe(expected);
        }
      });
    });
  });

  it('rotates the variant from one day to the next', () => {
    const noon = (dayOffset: number) => new Date(2024, 0, 7 + dayOffset, 12, 0, 0, 0);
    const firstThree = [0, 7, 14].map((offset) => getGreetingOption(noon(offset)).key);
    expect(new Set(firstThree).size).toBeGreaterThan(1);
  });

  it('picks a variant that belongs to the active slot', () => {
    dayKeys.forEach((_key, dayIndex) => {
      for (let hour = 0; hour < 24; hour++) {
        const date = dateForDay(dayIndex, hour);
        expect(getGreetingSlot(date).options).toContain(getGreetingOption(date));
      }
    });
  });
});

describe('getGreetingKey', () => {
  it('uses the personalized key only when a name is available', () => {
    const date = dateForDay(3, 20);
    const option = getGreetingOption(date);
    expect(getGreetingKey(date, true)).toBe(option.namedKey);
    expect(getGreetingKey(date, false)).toBe(option.key);
  });

  it('resolves a personalized key at every hour of every day', () => {
    dayKeys.forEach((_key, dayIndex) => {
      for (let hour = 0; hour < 24; hour++) {
        expect(textFor(getGreetingKey(dateForDay(dayIndex, hour), true))).toContain('{{name}}');
      }
    });
  });
});

describe('getMsUntilNextGreeting', () => {
  it('counts down to the end of the active slot', () => {
    expect(getMsUntilNextGreeting(dateForDay(2, 3, 59, 0))).toBe(60 * 1000);
    expect(getMsUntilNextGreeting(dateForDay(2, 6, 59, 0))).toBe(60 * 1000);
    expect(getMsUntilNextGreeting(dateForDay(2, 11, 30, 0))).toBe(30 * 60 * 1000);
    expect(getMsUntilNextGreeting(dateForDay(2, 16, 0, 0))).toBe(60 * 60 * 1000);
    expect(getMsUntilNextGreeting(dateForDay(2, 21, 0, 0))).toBe(60 * 60 * 1000);
  });

  it('rolls over to local midnight for the final slot', () => {
    expect(getMsUntilNextGreeting(dateForDay(2, 23, 0, 0))).toBe(60 * 60 * 1000);
  });
});

describe('daypart greeting', () => {
  const at = (hours: number, minutes = 0) => new Date(2024, 0, 9, hours, minutes, 0, 0);

  it.each([
    [5, 'morning'],
    [11, 'morning'],
    [12, 'afternoon'],
    [17, 'afternoon'],
    [18, 'evening'],
    [23, 'evening'],
    [0, 'evening'],
    [4, 'evening'],
  ])('treats %i:00 as %s', (hours, daypart) => {
    expect(getDaypart(at(hours))).toBe(daypart);
  });

  it('says good afternoon to the named user in Korean', () => {
    const key = getDaypartGreetingKey(at(14), true);
    expect(translationKo[key as keyof typeof translationKo]).toBe('좋은 오후예요, {{name}}님');
  });

  it('uses the unnamed greeting when the user has no name', () => {
    const key = getDaypartGreetingKey(at(8), false);
    expect(translationKo[key as keyof typeof translationKo]).toBe('좋은 아침이에요');
  });

  it('has an English and Korean string for every daypart key', () => {
    for (const hours of [8, 14, 20]) {
      for (const named of [true, false]) {
        const key = getDaypartGreetingKey(at(hours), named);
        expect(translationEn).toHaveProperty(key);
        expect(translationKo).toHaveProperty(key);
      }
    }
  });

  it('waits until noon during the morning', () => {
    expect(getMsUntilNextDaypart(at(11, 30))).toBe(30 * 60 * 1000);
  });

  it('waits until the next morning after the evening starts', () => {
    expect(getMsUntilNextDaypart(at(23))).toBe(6 * 60 * 60 * 1000);
  });

  it('waits until 05:00 in the small hours', () => {
    expect(getMsUntilNextDaypart(at(3))).toBe(2 * 60 * 60 * 1000);
  });
});
