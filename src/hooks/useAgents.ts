import { useQuery } from '@tanstack/react-query';
import { getProject, getSchedulerNextFire, listProjects, projectRefById } from '../api/projects';
import { loadConnectionSettings } from '../api/connection';
import { projectToCards, type AgentCard } from '../domain/agentCard';
import type { Project } from '../api/gen/agentcompose/v2/agentcompose_pb';

/** 「我的 AI 助手」数据源：ListProjects → 每个项目 GetProject(includeSpec) → 每 agent 解析下次运行时间。 */
export function useAgents() {
  return useQuery({
    queryKey: ['agents'],
    queryFn: async (): Promise<AgentCard[]> => {
      const s = loadConnectionSettings();
      const summaries = await listProjects(s);
      const projects = (
        await Promise.all(summaries.map((p) => getProject(s, projectRefById(p.projectId), true)))
      ).filter((p): p is Project => Boolean(p));
      const cards: AgentCard[] = [];
      for (const proj of projects) {
        const fire = new Map<string, Date | null>();
        for (const sch of proj.schedulers) {
          try {
            fire.set(sch.agentName, await getSchedulerNextFire(s, projectRefById(proj.summary?.projectId ?? ''), sch.agentName));
          } catch {
            fire.set(sch.agentName, null);
          }
        }
        cards.push(...projectToCards(proj, (a) => fire.get(a.agentName) ?? null));
      }
      return cards;
    },
  });
}
