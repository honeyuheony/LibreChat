import { pageTopBarClassName } from '../topbar';

describe('pageTopBarClassName', () => {
  const classes = pageTopBarClassName.split(' ');

  it('blurs the content behind it and marks its lower edge with a shadow instead of a border', () => {
    expect(classes).toEqual(
      expect.arrayContaining([
        'bg-presentation/70',
        'backdrop-blur-[20px]',
        'backdrop-saturate-[1.8]',
        'shadow-[0_1px_0]',
        'shadow-border-light/60',
      ]),
    );
    expect(classes).not.toContain('border-b');
    expect(classes).not.toContain('backdrop-blur-md');
  });

  it('keeps its content 24px from both sides', () => {
    expect(classes).toContain('px-6');
    expect(classes).not.toContain('px-4');
  });
});
