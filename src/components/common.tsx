import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ImagePlus, X, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { api, fetchApi, uploadImage, type Attachment } from "@/lib/api";

export function Markdown({ children }: { children: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: (props) => (
            <a {...props} target="_blank" rel="noopener noreferrer" />
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

export function ErrorNotice({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  return (
    <div className="error-notice" role="alert">
      <AlertCircle size={17} />
      <span>{message}</span>
      {retry && (
        <Button size="sm" variant="ghost" onClick={retry}>
          重试
        </Button>
      )}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: React.ComponentType<{ size: number }>;
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Icon size={26} />
      </div>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}

export function Picture({ id }: { id: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let alive = true;
    let objectUrl = "";
    fetchApi(`/attachments/${id}/content`)
      .then((res) => res.blob())
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        if (alive) setUrl(objectUrl);
        else URL.revokeObjectURL(objectUrl);
      })
      .catch(() => {});
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id]);
  return url ? (
    <img src={url} alt="提交的图片" className="attachment-picture" />
  ) : (
    <span className="image-loading">图片加载中</span>
  );
}

export function ImagesInput({
  images,
  onChange,
  disabled,
  onError,
  onUploading,
}: {
  images: Attachment[];
  onChange: (values: Attachment[]) => void;
  disabled?: boolean;
  onError: (message: string) => void;
  onUploading?: (value: boolean) => void;
}) {
  const [uploading, setUploading] = useState(false);
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    if (images.length + files.length > 4) {
      onError("每次最多提交 4 张图片");
      return;
    }
    setUploading(true);
    onUploading?.(true);
    try {
      const uploaded: Attachment[] = [];
      for (const file of Array.from(files))
        uploaded.push(await uploadImage(file));
      onChange([...images, ...uploaded]);
    } catch (error) {
      onError((error as Error).message);
    } finally {
      setUploading(false);
      onUploading?.(false);
    }
  }
  return (
    <div className="image-input">
      <label
        className={`attach-button ${disabled ? "disabled" : ""}`}
        title="添加图片"
      >
        <input
          aria-label="添加图片"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          disabled={disabled || uploading}
          onChange={(e) => {
            void upload(e.target.files);
            e.target.value = "";
          }}
        />
        {uploading ? (
          <Loader2 size={18} className="spin" />
        ) : (
          <ImagePlus size={18} />
        )}
      </label>
      {images.map((image) => (
        <span className="file-chip" key={image.id}>
          {image.name}
          <button
            type="button"
            aria-label={`移除 ${image.name}`}
            disabled={disabled || uploading}
            onClick={() => onChange(images.filter((x) => x.id !== image.id))}
          >
            <X size={12} />
          </button>
        </span>
      ))}
    </div>
  );
}

export function ConfirmDelete({
  open,
  title,
  description,
  label,
  error,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  label: string;
  error?: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <AlertDialog
      open={open}
      onOpenChange={(value) => {
        if (!value && !busy) onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {error && <ErrorNotice message={error} />}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>保留</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "正在删除…" : label}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export const nodeStatus: Record<string, string> = {
  not_started: "未开始",
  in_progress: "进行中",
  needs_practice: "待巩固",
  passed: "练习通过",
  skipped: "已跳过 · 尚未验证",
};
export const reminderStatus: Record<string, string> = {
  active: "待提醒",
  fired: "已提醒",
  completed: "已完成",
  cancelled: "已取消",
};

export async function remove(
  path: string,
  refresh: () => Promise<void> | void,
  onError: (message: string) => void,
) {
  try {
    await api(path, "DELETE");
    await refresh();
  } catch (error) {
    onError((error as Error).message);
  }
}
