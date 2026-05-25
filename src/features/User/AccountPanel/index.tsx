'use client';

import { Popover } from '@lobehub/ui';
import { createStaticStyles } from 'antd-style';
import { type PropsWithChildren } from 'react';
import { memo, Suspense, useEffect, useRef, useState } from 'react';

import { type MenuProps } from '@/components/Menu';
import { isDesktop } from '@/const/version';

import PanelContent from './PanelContent';

const styles = createStaticStyles(({ css }) => {
  return {
    popover: css`
      inset-block-end: ${isDesktop ? 16 : 8}px;
      inset-inline-start: 8px !important;
      border-radius: 10px;
    `,
    popoverContent: css`
      padding: 0;
    `,
  };
});

interface AccountPanelProps extends PropsWithChildren {
  extraItems?: MenuProps['items'];
}

const AccountPanel = memo<AccountPanelProps>(({ children, extraItems }) => {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const [triggerWidth, setTriggerWidth] = useState<number>();

  useEffect(() => {
    const node = triggerRef.current;
    if (!node) return;

    const update = () => setTriggerWidth(node.getBoundingClientRect().width);
    update();

    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <Suspense fallback={children}>
      <Popover
        arrow={false}
        open={open}
        placement="topLeft"
        styles={triggerWidth ? { content: { minWidth: triggerWidth } } : undefined}
        trigger="click"
        classNames={{
          root: styles.popover,
          content: styles.popoverContent,
        }}
        content={<PanelContent closePopover={() => setOpen(false)} extraItems={extraItems} />}
        onOpenChange={setOpen}
      >
        <div ref={triggerRef} style={{ display: 'flex', flex: 1, minWidth: 0 }}>
          {children}
        </div>
      </Popover>
    </Suspense>
  );
});

AccountPanel.displayName = 'AccountPanel';

export default AccountPanel;
