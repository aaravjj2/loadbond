"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { type Workspace, type Item, type View, type Api } from "./types";
const views: View[] = [
  "assessment",
  "review",
  "register",
  "scenarios",
  "evidence",
];
export function useWorkspace() {
  const [token, setToken] = useState("");
  const [projects, setProjects] = useState<Item[]>([]);
  const [w, setW] = useState<Workspace | null>(null);
  const [reviewer, setReviewer] = useState("");
  const [view, setView] = useState<View>("assessment");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const active = useRef("");
  const generation = useRef(0);
  const api: Api = useCallback(
    async (path, body, method) => {
      const response = await fetch("/api/v2/" + path, {
        method: method || (body === undefined ? "GET" : "POST"),
        headers: {
          Authorization: "Bearer " + token,
          ...(body && !(body instanceof FormData)
            ? { "Content-Type": "application/json" }
            : {}),
        },
        body:
          body instanceof FormData
            ? body
            : body === undefined
              ? undefined
              : JSON.stringify(body),
        cache: "no-store",
      });
      if (!response.ok) {
        const e = await response
          .json()
          .catch(() => ({ detail: "Request failed" }));
        throw new Error(
          typeof e.detail === "string" ? e.detail : JSON.stringify(e.detail),
        );
      }
      return response.json();
    },
    [token],
  );
  const refresh = useCallback(
    async (id = active.current) => {
      const stamp = ++generation.current;
      const [list, next] = await Promise.all([
        api("projects"),
        id ? api("projects/" + id) : Promise.resolve(null),
      ]);
      if (stamp !== generation.current) return;
      setProjects(list.projects);
      setReviewer(list.reviewer);
      if (id === active.current) setW(next);
    },
    [api],
  );
  const navigate = useCallback(
    (next: View, id = active.current, extra: Record<string, string> = {}) => {
      setView(next);
      const q = new URLSearchParams();
      if (id) {
        q.set("project", id);
        q.set("view", next);
      }
      for (const [k, v] of Object.entries(extra)) if (v) q.set(k, v);
      window.history.replaceState(
        null,
        "",
        q.size ? "?" + q.toString() : window.location.pathname,
      );
    },
    [],
  );
  const open = useCallback(
    async (id: string, next: View = "assessment") => {
      active.current = id;
      setW(null);
      setLoading(true);
      try {
        await refresh(id);
        navigate(next, id);
      } finally {
        setLoading(false);
      }
    },
    [refresh, navigate],
  );
  const act = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("loadbond-v2-token");
    if (cached) setToken(cached);
  }, []);
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoading(true);
    const q = new URLSearchParams(window.location.search);
    const id = q.get("project") || "";
    const requested = q.get("view") as View;
    active.current = id;
    setView(views.includes(requested) ? requested : "assessment");
    refresh(id)
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      generation.current++;
    };
  }, [token, refresh]);
  const pending =
    w?.extractions
      .filter((j) => ["QUEUED", "RUNNING"].includes(j.status))
      .map((j) => j.id)
      .join(",") || "";
  useEffect(() => {
    if (!pending) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const id = active.current;
    async function poll() {
      try {
        const next = await api("projects/" + id);
        if (!stopped && active.current === id) setW(next);
      } catch (e) {
        if (!stopped) setError(e instanceof Error ? e.message : String(e));
      }
      if (!stopped) timer = setTimeout(poll, 2000);
    }
    timer = setTimeout(poll, 1000);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [pending, api]);
  function connect(value: string) {
    sessionStorage.setItem("loadbond-v2-token", value);
    setToken(value);
  }
  function allProjects() {
    active.current = "";
    setW(null);
    navigate("assessment", "");
  }
  function logout() {
    sessionStorage.removeItem("loadbond-v2-token");
    active.current = "";
    setToken("");
    setW(null);
    setProjects([]);
    navigate("assessment", "");
  }
  return {
    token,
    projects,
    w,
    reviewer,
    view,
    busy,
    loading,
    error,
    notice,
    api,
    refresh,
    navigate,
    open,
    act,
    connect,
    logout,
    allProjects,
    setNotice,
    setError,
  };
}
