import { useRef, useState } from "react";
import {
  Bell,
  BellOff,
  BookOpen,
  Brain,
  Calculator,
  CalendarClock,
  ChevronDown,
  CloudSun,
  FileText,
  GraduationCap,
  Layers2,
  ListTodo,
  Loader2,
  Ruler,
  Search,
  Settings2,
  BookmarkPlus,
} from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { api, type Tool } from "@/lib/api";

const examples: Record<string, string> = {
  get_weather: "帮我查一下广州今天和未来三天的天气，出门要带伞吗？",
  web_search: "帮我联网搜索：",
  read_url: "帮我阅读并总结这个网页：",
  calculate: "帮我计算：(199 + 89) * 0.85",
  date_time: "从今天起 30 天后是几月几日、星期几？",
  convert_units: "帮我把 5 英里换算成公里。",
  search_memories: "我之前告诉过你哪些个人偏好？",
  remember: "请记住：",
  create_reminder: "请提醒我：",
  list_reminders: "我目前有哪些待办提醒？",
  cancel_reminder: "帮我查看待办提醒，我想取消其中一项。",
  learning_goals: "我目前的学习进度怎么样了？",
  create_learning_goal:
    "我想系统学习 Python，请先了解我的基础，再规划学习路线。",
};

const toolIcons: Record<string, typeof Search> = {
  get_weather: CloudSun,
  web_search: Search,
  read_url: FileText,
  calculate: Calculator,
  date_time: CalendarClock,
  convert_units: Ruler,
  search_memories: Brain,
  remember: BookmarkPlus,
  create_reminder: Bell,
  list_reminders: ListTodo,
  cancel_reminder: BellOff,
  learning_goals: BookOpen,
  create_learning_goal: GraduationCap,
};

export function ToolboxMenu({
  onPrompt,
  onSettings,
}: {
  onPrompt: (prompt: string) => void;
  onSettings: () => void;
}) {
  const [tools, setTools] = useState<Tool[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const selectedPrompt = useRef<string | null>(null);
  async function load(open: boolean) {
    if (!open) return;
    setLoading(true);
    setError("");
    try {
      setTools(await api<Tool[]>("/tools"));
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setLoading(false);
    }
  }
  return (
    <DropdownMenu.Root onOpenChange={(open) => void load(open)}>
      <DropdownMenu.Trigger asChild>
        <button
          className="composer-toolbox-trigger"
          aria-label="查看 Agent 工具箱"
          title="查看可用工具"
        >
          <Layers2 size={15} />
          <span>工具</span>
          <small>自动</small>
          <ChevronDown size={13} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="model-menu toolbox-menu"
          align="start"
          side="top"
          sideOffset={8}
          collisionPadding={16}
          onCloseAutoFocus={(event) => {
            if (selectedPrompt.current) {
              event.preventDefault();
              onPrompt(selectedPrompt.current);
              selectedPrompt.current = null;
            }
          }}
        >
          <DropdownMenu.Label className="toolbox-menu-heading">
            <span className="toolbox-heading-icon">
              <Layers2 size={19} />
            </span>
            <span>
              <strong>工具箱</strong>
              <small>按需调用，点击填入示例</small>
            </span>
            {!loading && !error && (
              <span className="toolbox-count">{tools.length}</span>
            )}
          </DropdownMenu.Label>
          {loading && (
            <p className="toolbox-notice">
              <Loader2 size={14} className="spin" />
              正在读取工具…
            </p>
          )}
          {error && (
            <p className="toolbox-notice" role="alert">
              {error}
            </p>
          )}
          {!loading &&
            !error &&
            tools.map((tool) => {
              const Icon = toolIcons[tool.id] || Layers2;
              return (
                <DropdownMenu.Item
                  key={tool.id}
                  className="model-menu-item toolbox-item"
                  onSelect={() => {
                    if (tool.available)
                      selectedPrompt.current =
                        examples[tool.id] || `请使用${tool.name}：`;
                    else onSettings();
                  }}
                >
                  <span className="toolbox-row-icon">
                    <Icon size={17} />
                  </span>
                  <span className="toolbox-row-copy">
                    <strong>{tool.name}</strong>
                    <small>{tool.description}</small>
                  </span>
                  <span
                    className={`toolbox-status ${tool.available ? "" : "unavailable"}`}
                  >
                    {tool.note}
                  </span>
                </DropdownMenu.Item>
              );
            })}
          <DropdownMenu.Separator className="model-menu-separator" />
          <DropdownMenu.Item className="model-menu-item" onSelect={onSettings}>
            <Settings2 size={15} />
            连接与设置
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
