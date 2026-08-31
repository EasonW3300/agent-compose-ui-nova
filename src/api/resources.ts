import { createClient } from '@connectrpc/connect';
import { createDaemonTransport, type ConnectionSettings } from './connection';
import {
  CacheService, CapabilityService, ImageService, SandboxService, VolumeService,
  ImageStoreKind, SandboxStopMode,
  type CacheItem, type CapabilitySet, type CapabilityStatusResponse, type GetCapabilityCatalogResponse,
  type Image, type Sandbox, type Volume,
} from './gen/agentcompose/v2/agentcompose_pb';

function volumeClient(s: ConnectionSettings) { return createClient(VolumeService, createDaemonTransport(s)); }
function sandboxClient(s: ConnectionSettings) { return createClient(SandboxService, createDaemonTransport(s)); }
function imageClient(s: ConnectionSettings) { return createClient(ImageService, createDaemonTransport(s)); }
function cacheClient(s: ConnectionSettings) { return createClient(CacheService, createDaemonTransport(s)); }
function capabilityClient(s: ConnectionSettings) { return createClient(CapabilityService, createDaemonTransport(s)); }

export async function listVolumes(s: ConnectionSettings): Promise<Volume[]> {
  const res = await volumeClient(s).listVolumes({});
  return res.volumes;
}
export async function createVolume(s: ConnectionSettings, v: { name: string; driver: string }): Promise<void> {
  await volumeClient(s).createVolume({ name: v.name, driver: v.driver });
}
export async function removeVolume(s: ConnectionSettings, name: string): Promise<void> {
  await volumeClient(s).removeVolume({ name, force: false });
}
export async function pruneVolumes(s: ConnectionSettings): Promise<Volume[]> {
  const res = await volumeClient(s).pruneVolumes({ query: '', driver: '' });
  return res.matched;
}

export async function listSandboxes(s: ConnectionSettings): Promise<Sandbox[]> {
  const res = await sandboxClient(s).listSandboxes({});
  return res.sandboxes;
}
export async function stopSandbox(s: ConnectionSettings, sandboxId: string): Promise<void> {
  await sandboxClient(s).stopSandbox({ sandboxId, mode: SandboxStopMode.GRACEFUL });
}
export async function resumeSandbox(s: ConnectionSettings, sandboxId: string): Promise<void> {
  await sandboxClient(s).resumeSandbox({ sandboxId });
}
export async function removeSandbox(s: ConnectionSettings, sandboxId: string): Promise<void> {
  await sandboxClient(s).removeSandbox({ sandboxId, force: false });
}
export async function pruneSandboxes(s: ConnectionSettings): Promise<void> {
  await sandboxClient(s).pruneSandboxes({ projectId: '', force: false });
}

export async function listImages(s: ConnectionSettings): Promise<Image[]> {
  const res = await imageClient(s).listImages({});
  return res.images;
}
export async function removeImage(s: ConnectionSettings, imageRef: string): Promise<void> {
  await imageClient(s).removeImage({ imageRef, store: ImageStoreKind.UNSPECIFIED });
}

export async function listCaches(s: ConnectionSettings): Promise<CacheItem[]> {
  const res = await cacheClient(s).listCaches({});
  return res.caches;
}
export async function removeCache(s: ConnectionSettings, cacheId: string): Promise<void> {
  await cacheClient(s).removeCache({ cacheId, force: false });
}
export async function pruneCaches(s: ConnectionSettings): Promise<void> {
  await cacheClient(s).pruneCaches({ force: false });
}

export async function listCapabilitySets(s: ConnectionSettings): Promise<CapabilitySet[]> {
  const res = await capabilityClient(s).listCapabilitySets({});
  return res.capsets;
}
export async function getCapabilityCatalog(s: ConnectionSettings, capsetId: string): Promise<GetCapabilityCatalogResponse> {
  return capabilityClient(s).getCapabilityCatalog({ capsetId });
}
export async function getCapabilityStatus(s: ConnectionSettings): Promise<CapabilityStatusResponse> {
  return capabilityClient(s).getCapabilityStatus({});
}
