import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { loadConnectionSettings } from '../api/connection';
import {
  listCaches, listImages, listSandboxes, pruneCaches, pruneSandboxes,
  removeCache, removeImage, removeSandbox, resumeSandbox, stopSandbox,
} from '../api/resources';
import type { CacheItem, Image, Sandbox } from '../api/gen/agentcompose/v2/agentcompose_pb';
import { DANGEROUS_ACTIONS, describeCacheDomain, describeSandboxStatus } from '../domain/resourceView';
import './console.css';

export function SandboxesTab() {
  const queryClient = useQueryClient();
  const s = loadConnectionSettings();
  const sbx = useQuery({ queryKey: ['sandboxes'], queryFn: () => listSandboxes(s) });
  const imgs = useQuery({ queryKey: ['images'], queryFn: () => listImages(s) });
  const caches = useQuery({ queryKey: ['caches'], queryFn: () => listCaches(s) });
  const [stopping, setStopping] = useState<Sandbox | null>(null);
  const [removingSbx, setRemovingSbx] = useState<Sandbox | null>(null);
  const [removingImg, setRemovingImg] = useState<Image | null>(null);
  const [removingCache, setRemovingCache] = useState<CacheItem | null>(null);
  const [confirmingPrune, setConfirmingPrune] = useState<'sandboxes' | 'caches' | null>(null);
  const invalidate = () => { queryClient.invalidateQueries({ queryKey: ['sandboxes'] }); queryClient.invalidateQueries({ queryKey: ['images'] }); queryClient.invalidateQueries({ queryKey: ['caches'] }); };

  const stopMutation = useMutation({ mutationFn: async (x: Sandbox) => { await stopSandbox(s, x.sandboxId); }, onSuccess: () => { setStopping(null); invalidate(); } });
  const removeSbxMutation = useMutation({ mutationFn: async (x: Sandbox) => { await removeSandbox(s, x.sandboxId); }, onSuccess: () => { setRemovingSbx(null); invalidate(); } });
  const resumeMutation = useMutation({ mutationFn: async (x: Sandbox) => { await resumeSandbox(s, x.sandboxId); }, onSuccess: () => invalidate() });
  const pruneSbxMutation = useMutation({ mutationFn: async () => { await pruneSandboxes(s); }, onSuccess: () => { setConfirmingPrune(null); invalidate(); } });
  const removeImgMutation = useMutation({ mutationFn: async (x: Image) => { await removeImage(s, x.imageRef); }, onSuccess: () => { setRemovingImg(null); invalidate(); } });
  const removeCacheMutation = useMutation({ mutationFn: async (x: CacheItem) => { await removeCache(s, x.cacheId); }, onSuccess: () => { setRemovingCache(null); invalidate(); } });
  const pruneCacheMutation = useMutation({ mutationFn: async () => { await pruneCaches(s); }, onSuccess: () => { setConfirmingPrune(null); invalidate(); } });

  if (sbx.isLoading || imgs.isLoading || caches.isLoading) return <p role="status">正在加载沙箱与镜像…</p>;
  if (sbx.isError || imgs.isError || caches.isError) return <p role="alert">连不上 agent-compose，加载失败。</p>;

  return (
    <div className="res-section">
      <div className="run-section__head">
        <h3>沙箱（助手工作台）</h3>
        <button type="button" className="setup-btn setup-btn--ghost" onClick={() => setConfirmingPrune('sandboxes')}>清理已停止的工作台</button>
      </div>
      <table className="runs-table">
        <thead><tr><th>ID</th><th>状态</th><th>驱动</th><th></th></tr></thead>
        <tbody>
          {(sbx.data ?? []).map((x) => (
            <tr key={x.sandboxId}>
              <td>{x.sandboxId}</td>
              <td><span className={`run-status run-status--${describeSandboxStatus(x.status) === '运行中' ? 'running' : 'stopped'}`}>{describeSandboxStatus(x.status)}</span></td>
              <td>{x.driver}</td>
              <td>
                {describeSandboxStatus(x.status) === '运行中' ? (
                  <button type="button" className="setup-btn setup-btn--ghost" onClick={() => setStopping(x)}>停止</button>
                ) : (
                  <button type="button" className="setup-btn setup-btn--ghost" onClick={() => resumeMutation.mutate(x)}>恢复</button>
                )}{' '}
                <button type="button" className="setup-btn setup-btn--ghost" onClick={() => setRemovingSbx(x)}>移除</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="run-section__head" style={{ marginTop: 24 }}>
        <h3>镜像</h3>
      </div>
      <table className="runs-table">
        <thead><tr><th>镜像</th><th></th></tr></thead>
        <tbody>
          {(imgs.data ?? []).map((x) => (
            <tr key={x.imageRef}>
              <td>{x.imageRef}</td>
              <td><button type="button" className="setup-btn setup-btn--ghost" onClick={() => setRemovingImg(x)}>移除</button></td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="run-section__head" style={{ marginTop: 24 }}>
        <h3>缓存</h3>
        <button type="button" className="setup-btn setup-btn--ghost" onClick={() => setConfirmingPrune('caches')}>清理缓存</button>
      </div>
      <table className="runs-table">
        <thead><tr><th>缓存</th><th>域</th><th></th></tr></thead>
        <tbody>
          {(caches.data ?? []).map((x) => (
            <tr key={x.cacheId}>
              <td>{x.cacheId}</td>
              <td>{describeCacheDomain(x.domain)}</td>
              <td><button type="button" className="setup-btn setup-btn--ghost" onClick={() => setRemovingCache(x)}>移除</button></td>
            </tr>
          ))}
        </tbody>
      </table>

      {stopping && (
        <div className="auth-overlay" role="dialog" aria-label="停止确认">
          <div>
            <h3>停止这个工作台？</h3>
            <p>正在进行的任务会中断，可以之后再恢复。</p>
            <div className="auth-overlay__actions">
              <button type="button" className="setup-btn" disabled={stopMutation.isPending} onClick={() => stopMutation.mutate(stopping)}>确认停止</button>
              <button type="button" className="setup-btn setup-btn--ghost" onClick={() => setStopping(null)}>取消</button>
            </div>
          </div>
        </div>
      )}
      {removingSbx && (
        <div className="auth-overlay" role="dialog" aria-label="移除确认">
          <div>
            <h3>移除这个工作台？</h3>
            <p>{DANGEROUS_ACTIONS.removeSandbox}</p>
            <div className="auth-overlay__actions">
              <button type="button" className="setup-btn" disabled={removeSbxMutation.isPending} onClick={() => removeSbxMutation.mutate(removingSbx)}>确认移除</button>
              <button type="button" className="setup-btn setup-btn--ghost" onClick={() => setRemovingSbx(null)}>取消</button>
            </div>
          </div>
        </div>
      )}
      {removingImg && (
        <div className="auth-overlay" role="dialog" aria-label="移除确认">
          <div>
            <h3>移除镜像「{removingImg.imageRef}」？</h3>
            <p>{DANGEROUS_ACTIONS.removeImage}</p>
            <div className="auth-overlay__actions">
              <button type="button" className="setup-btn" disabled={removeImgMutation.isPending} onClick={() => removeImgMutation.mutate(removingImg)}>确认移除</button>
              <button type="button" className="setup-btn setup-btn--ghost" onClick={() => setRemovingImg(null)}>取消</button>
            </div>
          </div>
        </div>
      )}
      {removingCache && (
        <div className="auth-overlay" role="dialog" aria-label="移除确认">
          <div>
            <h3>移除这份缓存？</h3>
            <p>{DANGEROUS_ACTIONS.removeCache}</p>
            <div className="auth-overlay__actions">
              <button type="button" className="setup-btn" disabled={removeCacheMutation.isPending} onClick={() => removeCacheMutation.mutate(removingCache)}>确认移除</button>
              <button type="button" className="setup-btn setup-btn--ghost" onClick={() => setRemovingCache(null)}>取消</button>
            </div>
          </div>
        </div>
      )}
      {confirmingPrune === 'sandboxes' && (
        <div className="auth-overlay" role="dialog" aria-label="清理确认">
          <div>
            <h3>清理已停止的工作台？</h3>
            <p>{DANGEROUS_ACTIONS.pruneSandboxes}</p>
            <div className="auth-overlay__actions">
              <button type="button" className="setup-btn" disabled={pruneSbxMutation.isPending} onClick={() => pruneSbxMutation.mutate()}>确认清理</button>
              <button type="button" className="setup-btn setup-btn--ghost" onClick={() => setConfirmingPrune(null)}>取消</button>
            </div>
          </div>
        </div>
      )}
      {confirmingPrune === 'caches' && (
        <div className="auth-overlay" role="dialog" aria-label="清理确认">
          <div>
            <h3>清理未使用的缓存？</h3>
            <p>{DANGEROUS_ACTIONS.pruneCaches}</p>
            <div className="auth-overlay__actions">
              <button type="button" className="setup-btn" disabled={pruneCacheMutation.isPending} onClick={() => pruneCacheMutation.mutate()}>确认清理</button>
              <button type="button" className="setup-btn setup-btn--ghost" onClick={() => setConfirmingPrune(null)}>取消</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
