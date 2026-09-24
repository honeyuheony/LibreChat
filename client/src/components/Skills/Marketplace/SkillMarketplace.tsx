import React, { useEffect, useMemo } from 'react';
import { Spinner, useMediaQuery } from '@librechat/client';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { TSkillSummary } from 'librechat-data-provider';
import { useDocumentTitle, useHasAccess, useLocalize } from '~/hooks';
import {
  useGetEndpointsQuery,
  useSkillsInfiniteQuery,
  useSkillCategoriesQuery,
} from '~/data-provider';
import { ALL_CATEGORY, collectCategories, filterSkills, getCategoryLabel } from './skillCategories';
import OpenSidebar from '~/components/Chat/Menus/OpenSidebar';
import SearchBar from '~/components/Agents/SearchBar';
import { SidePanelGroup } from '~/components/SidePanel';
import SkillCategoryTabs from './SkillCategoryTabs';
import SkillCard from './SkillCard';

const BASE_PATH = '/skills-market';

/**
 * SkillMarketplace - full-page catalog of skills, laid out like the agent marketplace
 * (hero, search, category tabs, two-column cards, detail dialog).
 *
 * Differences from the agent marketplace: skills have no "promoted" flag, so the
 * whole catalog is still loaded once for filtering and search on the client, but the
 * category tabs and their counts come from `GET /api/skills/categories` instead of
 * being derived from that loaded catalog.
 */
export default function SkillMarketplace() {
  const localize = useLocalize();
  const navigate = useNavigate();
  const { category } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const isSmallScreen = useMediaQuery('(max-width: 768px)');
  const searchQuery = searchParams.get('q') || '';
  const activeCategory = category || ALL_CATEGORY;

  useDocumentTitle(`${localize('com_skills_marketplace')} | LibreChat`);
  useGetEndpointsQuery();

  const { data, isLoading, isError, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useSkillsInfiniteQuery({ limit: 100 });
  const { data: categoriesData } = useSkillCategoriesQuery();

  /* Load every page so tabs and search cover the full catalog (same as SkillsCommand). */
  useEffect(() => {
    if (!isError && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, isError, fetchNextPage]);

  const allSkills = useMemo<TSkillSummary[]>(() => {
    if (!data?.pages) {
      return [];
    }
    return data.pages.flatMap((page) => page.skills);
  }, [data?.pages]);

  const categories = useMemo(
    () => collectCategories(categoriesData?.categories ?? []),
    [categoriesData?.categories],
  );
  const categoryCounts = useMemo(() => {
    const entries = categoriesData?.categories ?? [];
    const counts: Record<string, number> = {
      [ALL_CATEGORY]: entries.reduce((sum, entry) => sum + entry.count, 0),
    };
    for (const entry of entries) {
      counts[entry.value] = entry.count;
    }
    return counts;
  }, [categoriesData?.categories]);
  const visibleSkills = useMemo(
    () => filterSkills(allSkills, activeCategory, searchQuery),
    [allSkills, activeCategory, searchQuery],
  );

  const goTo = (nextCategory: string, params: URLSearchParams) => {
    const suffix = params.toString() ? `?${params.toString()}` : '';
    const path = nextCategory === ALL_CATEGORY ? BASE_PATH : `${BASE_PATH}/${nextCategory}`;
    navigate(`${path}${suffix}`);
  };

  const handleTabChange = (value: string) => {
    if (value !== activeCategory) {
      goTo(value, new URLSearchParams(searchParams));
    }
  };

  const handleSearch = (query: string) => {
    const params = new URLSearchParams(searchParams);
    if (query.trim()) {
      params.set('q', query.trim());
    } else {
      params.delete('q');
    }
    setSearchParams(params);
  };

  const hasAccessToSkills = useHasAccess({
    permissionType: PermissionTypes.SKILLS,
    permission: Permissions.USE,
  });
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    if (!hasAccessToSkills) {
      timeoutId = setTimeout(() => navigate('/c/new'), 1000);
    }
    return () => clearTimeout(timeoutId);
  }, [hasAccessToSkills, navigate]);

  if (!hasAccessToSkills) {
    return null;
  }

  return (
    <div className="relative flex w-full grow overflow-hidden bg-presentation">
      <SidePanelGroup>
        <main className="flex h-full flex-col overflow-hidden" role="main">
          <div className="scrollbar-gutter-stable relative flex h-full flex-col overflow-y-auto overflow-x-hidden">
            {!isSmallScreen && (
              <div className="container mx-auto max-w-4xl">
                <div className="mb-8 mt-12 text-center">
                  <h1 className="mb-3 text-3xl font-bold tracking-tight text-text-primary md:text-5xl">
                    {localize('com_skills_marketplace')}
                  </h1>
                  <p className="mx-auto mb-6 max-w-2xl text-lg text-text-secondary">
                    {localize('com_skills_marketplace_subtitle')}
                  </p>
                </div>
              </div>
            )}
            <div className="sticky top-0 z-10 mt-4 bg-presentation pb-4 md:mt-0">
              <div className="container mx-auto max-w-4xl px-4">
                {isSmallScreen ? (
                  <div className="mx-auto mb-3 flex max-w-2xl items-center gap-2">
                    <OpenSidebar />
                  </div>
                ) : null}
                <div className="mx-auto flex max-w-2xl gap-2 pb-6">
                  <SearchBar
                    value={searchQuery}
                    onSearch={handleSearch}
                    placeholder={localize('com_skills_search_placeholder')}
                  />
                </div>
                {categories.length > 1 && (
                  <SkillCategoryTabs
                    categories={categories}
                    activeTab={activeCategory}
                    onChange={handleTabChange}
                    counts={categoryCounts}
                  />
                )}
              </div>
            </div>
            <div className="container mx-auto max-w-4xl px-4 pb-8">
              {!searchQuery && (
                <div className="mb-6 mt-6 text-left">
                  <h2 className="text-2xl font-bold text-text-primary">
                    {getCategoryLabel(activeCategory, localize)}
                  </h2>
                </div>
              )}
              <div
                className="space-y-6"
                role="tabpanel"
                id={`skill-category-panel-${activeCategory}`}
                aria-busy={isLoading}
              >
                {isLoading ? (
                  <div className="flex justify-center py-12" role="status">
                    <Spinner className="h-6 w-6 text-text-primary" />
                  </div>
                ) : visibleSkills.length === 0 ? (
                  <div className="py-12 text-center text-text-secondary" role="status">
                    <h3 className="mb-2 text-lg font-medium">{localize('com_skills_empty')}</h3>
                  </div>
                ) : (
                  <div className="mx-4 grid grid-cols-1 gap-6 md:grid-cols-2" role="grid">
                    {visibleSkills.map((skill) => (
                      <div key={skill._id} role="gridcell">
                        <SkillCard skill={skill} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>
      </SidePanelGroup>
    </div>
  );
}
