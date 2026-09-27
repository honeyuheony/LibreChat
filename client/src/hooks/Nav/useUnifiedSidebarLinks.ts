import { useMemo } from 'react';
import { useRecoilValue } from 'recoil';
import { useLocation, useNavigate } from 'react-router-dom';
import { useUserKeyQuery } from 'librechat-data-provider/react-query';
import { getConfigDefaults, getEndpointField } from 'librechat-data-provider';
import { BarChart3, BookOpen, MessagesSquare, Plug, Store } from 'lucide-react';
import type { TEndpointsConfig } from 'librechat-data-provider';
import type { NavLink } from '~/common';
import {
  useGetEndpointsQuery,
  useGetStartupConfig,
  useInsightsAccessQuery,
  useSkillCategoriesQuery,
} from '~/data-provider';
import ConversationsSection from '~/components/UnifiedSidebar/ConversationsSection';
import usePendingConnectorCount from '~/hooks/Nav/usePendingConnectorCount';
import { DATA_HUB_PATH } from '~/components/Connectors/status';
import useSideNavLinks from '~/hooks/Nav/useSideNavLinks';
import { useAuthContext } from '~/hooks';
import store from '~/store';

const defaultInterface = getConfigDefaults().interface;
const SKILLS_MARKET_PATH = '/skills-market';

/** 이 패널들은 대화 사이드바 대신 전용 화면이나 탭에서 관리한다. */
const panelsReplacedElsewhere = new Set(['files', 'skills', 'schedules']);

export default function useUnifiedSidebarLinks() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuthContext();
  /** Selector instead of the full conversation atom: the links only depend on
   * the endpoint, so parameter edits and other conversation writes stay out. */
  const endpoint = useRecoilValue(store.conversationEndpointByIndex(0)) ?? undefined;
  const { data: startupConfig } = useGetStartupConfig();
  const { data: endpointsConfig = {} as TEndpointsConfig } = useGetEndpointsQuery();

  const interfaceConfig = useMemo(
    () => startupConfig?.interface ?? defaultInterface,
    [startupConfig],
  );
  const insightsFeatureEnabled = startupConfig?.insightsEnabled === true;
  const isInsightsRoute = location.pathname.startsWith('/insights');
  const { data: insightsAccess, isLoading: isInsightsAccessLoading } = useInsightsAccessQuery(
    user?.id,
    {
      enabled: !!user && insightsFeatureEnabled && !isInsightsRoute,
    },
  );

  const endpointType = useMemo(
    () => getEndpointField(endpointsConfig, endpoint, 'type'),
    [endpoint, endpointsConfig],
  );

  const userProvidesKey = useMemo(
    () => !!(endpointsConfig?.[endpoint ?? '']?.userProvide ?? false),
    [endpointsConfig, endpoint],
  );

  const { data: keyExpiry = { expiresAt: undefined } } = useUserKeyQuery(endpoint ?? '');

  const keyProvided = useMemo(
    () => (userProvidesKey ? !!(keyExpiry.expiresAt ?? '') : true),
    [keyExpiry.expiresAt, userProvidesKey],
  );

  const sideNavLinks = useSideNavLinks({
    keyProvided,
    endpoint,
    endpointType,
    interfaceConfig,
    endpointsConfig,
    includeHidePanel: false,
  });

  const hasSkillsPanel = sideNavLinks.some((link) => link.id === 'skills');
  const { data: skillCategories } = useSkillCategoriesQuery({ enabled: hasSkillsPanel });
  const marketCount = skillCategories?.categories.reduce((sum, entry) => sum + entry.count, 0);
  const pendingConnectorCount = usePendingConnectorCount();

  const links = useMemo(() => {
    const conversationLink: NavLink = {
      title: 'com_ui_chat_history',
      label: '',
      icon: MessagesSquare,
      id: 'conversations',
      Component: ConversationsSection,
    };
    const connectorsLink: NavLink = {
      title: 'com_ui_data_hub',
      label: '',
      icon: Plug,
      id: 'connectors',
      activePath: DATA_HUB_PATH,
      glyph: '⇄',
      sub: 'MCP',
      badge: pendingConnectorCount,
      badgeLabel: 'com_ui_data_hub_status_needs_connection',
      onClick: () => navigate(DATA_HUB_PATH),
    };
    const marketLinks: NavLink[] = hasSkillsPanel
      ? [
          {
            title: 'com_skills_marketplace',
            label: '',
            icon: Store,
            id: 'skills-market',
            activePath: SKILLS_MARKET_PATH,
            glyph: '/',
            trailing: marketCount != null ? String(marketCount) : undefined,
            onClick: () => navigate(SKILLS_MARKET_PATH),
          },
        ]
      : [];

    const libraryLink: NavLink = {
      title: 'com_ui_library',
      label: '',
      icon: BookOpen,
      id: 'library',
      activePath: '/library',
      glyph: '▣',
      onClick: () => navigate('/library'),
    };

    const otherLinks = sideNavLinks.filter((link) => !panelsReplacedElsewhere.has(link.id));
    const leadingLinks = [conversationLink, ...marketLinks, connectorsLink, libraryLink];

    if (
      !insightsFeatureEnabled ||
      (!isInsightsRoute && !isInsightsAccessLoading && insightsAccess?.access !== true)
    ) {
      return [...leadingLinks, ...otherLinks];
    }

    const insightsLink: NavLink = {
      title: 'com_insights_navigation',
      label: '',
      icon: BarChart3,
      id: 'insights',
      disabled: !isInsightsRoute && isInsightsAccessLoading,
      onClick: () => {
        if (!location.pathname.startsWith('/insights')) {
          navigate('/insights');
        }
      },
    };

    return [...leadingLinks, ...otherLinks, insightsLink];
  }, [
    insightsAccess?.access,
    insightsFeatureEnabled,
    isInsightsAccessLoading,
    isInsightsRoute,
    location.pathname,
    hasSkillsPanel,
    marketCount,
    pendingConnectorCount,
    navigate,
    sideNavLinks,
  ]);

  return links;
}
