export interface JwPlayerInstance {
  setup(config: Record<string, unknown>): JwPlayerInstance;
  remove(): void;
  getContainer(): HTMLElement;
  getPosition(): number;
  seek(position: number): JwPlayerInstance;
  addButton(img: string, tooltip: string, callback: () => void, id: string, btnClass?: string): JwPlayerInstance;
  once(event: "ready", callback: () => void): JwPlayerInstance;
}

type JwPlayerFactory = (id: HTMLElement | string) => JwPlayerInstance;

declare global {
  interface Window {
    jwplayer?: JwPlayerFactory;
  }
}

let scriptPromise: Promise<JwPlayerFactory> | null = null;

export function loadJwPlayer(): Promise<JwPlayerFactory> {
  if (typeof window === "undefined") return Promise.reject(new Error("loadJwPlayer called server-side"));
  if (window.jwplayer) return Promise.resolve(window.jwplayer);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/jwplayer/jwplayer.js";
    script.async = false;
    script.onload = () => {
      if (window.jwplayer) resolve(window.jwplayer);
      else reject(new Error("jwplayer.js loaded but did not register window.jwplayer"));
    };
    script.onerror = () => reject(new Error("Failed to load jwplayer.js"));
    document.head.appendChild(script);
  });

  return scriptPromise;
}
