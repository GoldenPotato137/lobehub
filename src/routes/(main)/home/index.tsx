import { Flexbox } from '@lobehub/ui';
import { type FC } from 'react';
import { useLocation } from 'react-router-dom';

import HomePageTracker from '@/components/Analytics/HomePageTracker';
import PageTitle from '@/components/PageTitle';
import NavHeader from '@/features/NavHeader';
import WideScreenContainer from '@/features/WideScreenContainer';
import { useWorkspaceStore, workspaceSelectors } from '@/store/workspace';

import HomeContent from './features';

const Home: FC = () => {
  const { pathname } = useLocation();
  const activeSlug = useWorkspaceStore((s) => workspaceSelectors.activeWorkspace(s)?.slug ?? null);
  const isHomeRoute =
    pathname === '/' ||
    (!!activeSlug && (pathname === `/${activeSlug}` || pathname === `/${activeSlug}/`));

  return (
    <>
      {isHomeRoute && <PageTitle title="" />}
      <HomePageTracker />
      <NavHeader />
      <Flexbox
        height={'100%'}
        style={{ overflowY: 'auto', paddingBlock: '44px 16vh' }}
        width={'100%'}
      >
        <WideScreenContainer>
          <HomeContent />
        </WideScreenContainer>
      </Flexbox>
    </>
  );
};

export default Home;
