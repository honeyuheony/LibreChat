import { useMemo } from 'react';
import { useRecoilValue } from 'recoil';
import { useLocation, useNavigate } from 'react-router-dom';
import { BarChart3, MessagesSquare, Plug, Store } from 'lucide-react';
import { useUserKeyQuery } from 'librechat-data-provider/react-query';
import { getConfigDefaults, getEndpointField } from 'librechat-data-provider';
import type { TEndpointsConfig } from 'librechat-data-provider';
import type { NavLink } from '~/common';
import {
  useGetEndpointsQuery,
  useGetStartupConfig,
  useInsightsAccessQuery,
  useSkillCategoriesQuery,
} from '~/data-provider';
import ConversationsSection from '~/components/UnifiedSidebar/ConversationsSection';
import { DATA_HUB_PATH } from '~/components/Connectors/status';
import useSideNavLinks from '~/hooks/Nav/useSideNavLinks';
import { useAuthContext } from '~/hooks';
import store from '~/store';

const defaultInterface = getConfigDefaults().interface;
const SKILLS_MARKET_PATH = '/skills-market';

/** The files panel is managed from settings under Data. */
const panelsReplacedElsewhere = new Set(['files']);

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
  /** The marketplace's own "all" count: the sum of its category counts. */
  const marketCount = skillCategories?.categories.reduce((sum, entry) => sum + entry.count, 0);

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
      trailing: 'MCP',
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
            trailing: marketCount != null ? String(marketCount) : undefined,
            onClick: () => navigate(SKILLS_MARKET_PATH),
          },
        ]
      : [];

    const skillsLinks: NavLink[] = [];
    const otherLinks: NavLink[] = [];
    for (const link of sideNavLinks) {
      if (link.id === 'skills') {
        skillsLinks.push({ ...link, title: 'com_ui_sidebar_my_agents' });
      } else if (!panelsReplacedElsewhere.has(link.id)) {
        otherLinks.push(link);
      }
    }
    const leadingLinks = [conversationLink, ...marketLinks, connectorsLink, ...skillsLinks];

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
    navigate,
    sideNavLinks,
  ]);

  return links;
}
