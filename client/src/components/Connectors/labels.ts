import type { TranslationKeys } from '~/hooks';

export interface ToolLabel {
  title: TranslationKeys;
  description: TranslationKeys;
}

/** Tools with a user-facing name; the model still gets each server's own description. */
const TOOL_LABELS: Record<string, ToolLabel> = {
  calendar_create_event: {
    title: 'com_ui_connectors_tool_calendar_create_event',
    description: 'com_ui_connectors_tool_calendar_create_event_desc',
  },
  calendar_list_events: {
    title: 'com_ui_connectors_tool_calendar_list_events',
    description: 'com_ui_connectors_tool_calendar_list_events_desc',
  },
  channels_list: {
    title: 'com_ui_connectors_tool_channels_list',
    description: 'com_ui_connectors_tool_channels_list_desc',
  },
  conversations_add_message: {
    title: 'com_ui_connectors_tool_conversations_add_message',
    description: 'com_ui_connectors_tool_conversations_add_message_desc',
  },
  conversations_history: {
    title: 'com_ui_connectors_tool_conversations_history',
    description: 'com_ui_connectors_tool_conversations_history_desc',
  },
  conversations_replies: {
    title: 'com_ui_connectors_tool_conversations_replies',
    description: 'com_ui_connectors_tool_conversations_replies_desc',
  },
  conversations_search_messages: {
    title: 'com_ui_connectors_tool_conversations_search_messages',
    description: 'com_ui_connectors_tool_conversations_search_messages_desc',
  },
  create_directory: {
    title: 'com_ui_connectors_tool_create_directory',
    description: 'com_ui_connectors_tool_create_directory_desc',
  },
  directory_tree: {
    title: 'com_ui_connectors_tool_directory_tree',
    description: 'com_ui_connectors_tool_directory_tree_desc',
  },
  edit_file: {
    title: 'com_ui_connectors_tool_edit_file',
    description: 'com_ui_connectors_tool_edit_file_desc',
  },
  get_file_info: {
    title: 'com_ui_connectors_tool_get_file_info',
    description: 'com_ui_connectors_tool_get_file_info_desc',
  },
  gmail_read: {
    title: 'com_ui_connectors_tool_gmail_read',
    description: 'com_ui_connectors_tool_gmail_read_desc',
  },
  gmail_search: {
    title: 'com_ui_connectors_tool_gmail_search',
    description: 'com_ui_connectors_tool_gmail_search_desc',
  },
  list_allowed_directories: {
    title: 'com_ui_connectors_tool_list_allowed_directories',
    description: 'com_ui_connectors_tool_list_allowed_directories_desc',
  },
  list_directory: {
    title: 'com_ui_connectors_tool_list_directory',
    description: 'com_ui_connectors_tool_list_directory_desc',
  },
  list_directory_with_sizes: {
    title: 'com_ui_connectors_tool_list_directory_with_sizes',
    description: 'com_ui_connectors_tool_list_directory_with_sizes_desc',
  },
  list_folder: {
    title: 'com_ui_connectors_tool_list_folder',
    description: 'com_ui_connectors_tool_list_folder_desc',
  },
  list_hangul_files: {
    title: 'com_ui_connectors_tool_list_hangul_files',
    description: 'com_ui_connectors_tool_list_hangul_files_desc',
  },
  move_file: {
    title: 'com_ui_connectors_tool_move_file',
    description: 'com_ui_connectors_tool_move_file_desc',
  },
  read_file: {
    title: 'com_ui_connectors_tool_read_file',
    description: 'com_ui_connectors_tool_read_file_desc',
  },
  read_hangul_file: {
    title: 'com_ui_connectors_tool_read_hangul_file',
    description: 'com_ui_connectors_tool_read_hangul_file_desc',
  },
  read_hangul_tables: {
    title: 'com_ui_connectors_tool_read_hangul_tables',
    description: 'com_ui_connectors_tool_read_hangul_tables_desc',
  },
  read_hangul_text: {
    title: 'com_ui_connectors_tool_read_hangul_text',
    description: 'com_ui_connectors_tool_read_hangul_text_desc',
  },
  read_media_file: {
    title: 'com_ui_connectors_tool_read_media_file',
    description: 'com_ui_connectors_tool_read_media_file_desc',
  },
  read_multiple_files: {
    title: 'com_ui_connectors_tool_read_multiple_files',
    description: 'com_ui_connectors_tool_read_multiple_files_desc',
  },
  read_text_file: {
    title: 'com_ui_connectors_tool_read_text_file',
    description: 'com_ui_connectors_tool_read_text_file_desc',
  },
  search_files: {
    title: 'com_ui_connectors_tool_search_files',
    description: 'com_ui_connectors_tool_search_files_desc',
  },
  tavily_crawl: {
    title: 'com_ui_connectors_tool_tavily_crawl',
    description: 'com_ui_connectors_tool_tavily_crawl_desc',
  },
  tavily_extract: {
    title: 'com_ui_connectors_tool_tavily_extract',
    description: 'com_ui_connectors_tool_tavily_extract_desc',
  },
  tavily_map: {
    title: 'com_ui_connectors_tool_tavily_map',
    description: 'com_ui_connectors_tool_tavily_map_desc',
  },
  tavily_research: {
    title: 'com_ui_connectors_tool_tavily_research',
    description: 'com_ui_connectors_tool_tavily_research_desc',
  },
  tavily_search: {
    title: 'com_ui_connectors_tool_tavily_search',
    description: 'com_ui_connectors_tool_tavily_search_desc',
  },
  write_file: {
    title: 'com_ui_connectors_tool_write_file',
    description: 'com_ui_connectors_tool_write_file_desc',
  },
};

/** A tool name that means something else on one server, keyed `server/tool`. */
const SERVER_TOOL_LABELS: Record<string, ToolLabel> = {
  'filesystem/read_file': {
    title: 'com_ui_connectors_tool_filesystem_read_file',
    description: 'com_ui_connectors_tool_filesystem_read_file_desc',
  },
};

export function getToolLabel(serverName: string, toolName: string): ToolLabel | undefined {
  return SERVER_TOOL_LABELS[`${serverName}/${toolName}`] ?? TOOL_LABELS[toolName];
}
