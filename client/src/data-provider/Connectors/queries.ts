import { QueryKeys, dataService } from 'librechat-data-provider';
import { useQuery, UseQueryOptions, QueryObserverResult } from '@tanstack/react-query';
import type * as t from 'librechat-data-provider';

/** Relay가 인식한 데스크톱 앱 상태를 포커스 때 갱신해 새 앱도 반영한다. */
export const useDeskStatusQuery = (
  config?: UseQueryOptions<t.DeskStatusResponse>,
): QueryObserverResult<t.DeskStatusResponse> => {
  return useQuery<t.DeskStatusResponse>([QueryKeys.deskStatus], () => dataService.getDeskStatus(), {
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchOnMount: true,
    staleTime: 15 * 1000,
    retry: false,
    ...config,
  });
};

/** PC 폴더 도구가 권한을 기다릴 때 변경된 폴더 권한을 반영한다. */
export const useDeskPermissionsQuery = (
  config?: UseQueryOptions<t.DeskPermission[]>,
): QueryObserverResult<t.DeskPermission[]> => {
  return useQuery<t.DeskPermission[]>(
    [QueryKeys.deskPermissions],
    () => dataService.getDeskPermissions(),
    {
      refetchInterval: 2000,
      refetchOnWindowFocus: true,
      staleTime: 0,
      retry: false,
      ...config,
    },
  );
};

/** 로그인 전에도 설치할 수 있도록 공개된 relay 설치 파일 정보를 가져온다. */
export const useDeskAppReleaseQuery = (
  config?: UseQueryOptions<t.DeskAppReleaseResponse>,
): QueryObserverResult<t.DeskAppReleaseResponse> => {
  return useQuery<t.DeskAppReleaseResponse>(
    [QueryKeys.deskAppRelease],
    () => dataService.getDeskAppRelease(),
    {
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
      retry: false,
      ...config,
    },
  );
};

/** 최근 connector 도구 호출을 최신순으로 가져온다. */
export const useConnectorActivityQuery = (
  config?: UseQueryOptions<t.ConnectorActivityItem[]>,
): QueryObserverResult<t.ConnectorActivityItem[]> => {
  return useQuery<t.ConnectorActivityItem[]>(
    [QueryKeys.connectorActivity],
    () => dataService.getConnectorActivity(),
    {
      refetchOnWindowFocus: true,
      staleTime: 30 * 1000,
      retry: false,
      ...config,
    },
  );
};
