import { supabase } from '@/lib/supabase';
import type { MatchDay, PalmeirasCalendarSettings } from '@/components/PalmeirasCalendar';

export const CALENDAR_ASSET_BUCKET = 'calendar-assets';

export interface CalendarBrandingRecord {
  id: string;
  page_name: string;
  handle: string;
  logo_url: string | null;
  created_at: string;
}

export interface CalendarTeamAssetRecord {
  id: string;
  team_name: string;
  team_slug: string;
  logo_url: string;
  storage_path: string | null;
  created_at: string;
}

export interface CalendarProjectRecord {
  id: string;
  project_name: string;
  month: string;
  year: string;
  matches_text: string | null;
  matches: CalendarProjectMatchRecord[];
  calendar_format: string;
  visual_settings: Partial<PersistedCalendarVisualSettings> | null;
  branding_id: string | null;
  created_at: string;
  updated_at: string;
}

export type CalendarProjectMatchRecord = Pick<MatchDay, 'day' | 'homeTeam' | 'awayTeam' | 'isUndefined' | 'kickoff'>;

export interface CalendarProjectTeamSourceRecord {
  matches: CalendarProjectMatchRecord[] | null;
  matches_text: string | null;
}

export type PersistedCalendarVisualSettings = Omit<PalmeirasCalendarSettings, 'canvasFormat'>;

export const calendarFormatValues: PalmeirasCalendarSettings['canvasFormat'][] = ['feedPortrait', 'square', 'story'];

export const normalizeTeamSlug = (teamName: string) =>
  teamName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

const sanitizeFileName = (fileName: string) =>
  fileName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9.-]/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase();

const normalizeLogoFile = async (file: File) => {
  if (!file.type.startsWith('image/')) {
    return file;
  }

  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const nextImage = new Image();
      nextImage.onload = () => resolve(nextImage);
      nextImage.onerror = () => reject(new Error('Nao foi possivel carregar a imagem enviada.'));
      nextImage.src = objectUrl;
    });

    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = image.naturalWidth;
    sourceCanvas.height = image.naturalHeight;
    const sourceContext = sourceCanvas.getContext('2d');

    if (!sourceContext) {
      return file;
    }

    sourceContext.drawImage(image, 0, 0);
    const { data, width, height } = sourceContext.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);

    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const alpha = data[(y * width + x) * 4 + 3];

        if (alpha > 8) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    }

    if (maxX < minX || maxY < minY) {
      return file;
    }

    const cropWidth = maxX - minX + 1;
    const cropHeight = maxY - minY + 1;
    const longestSide = Math.max(cropWidth, cropHeight);
    const padding = Math.round(longestSide * 0.16);
    const outputSize = longestSide + padding * 2;

    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = outputSize;
    outputCanvas.height = outputSize;
    const outputContext = outputCanvas.getContext('2d');

    if (!outputContext) {
      return file;
    }

    outputContext.clearRect(0, 0, outputSize, outputSize);

    const offsetX = Math.round((outputSize - cropWidth) / 2);
    const offsetY = Math.round((outputSize - cropHeight) / 2);

    outputContext.drawImage(
      sourceCanvas,
      minX,
      minY,
      cropWidth,
      cropHeight,
      offsetX,
      offsetY,
      cropWidth,
      cropHeight,
    );

    const normalizedBlob = await new Promise<Blob | null>((resolve) => {
      outputCanvas.toBlob((blob) => resolve(blob), 'image/png');
    });

    if (!normalizedBlob) {
      return file;
    }

    return new File([normalizedBlob], file.name.replace(/\.[^.]+$/, '') + '.png', {
      type: 'image/png',
      lastModified: Date.now(),
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

const uploadAsset = async (folder: 'branding' | 'teams', pathPrefix: string, file: File) => {
  const normalizedFile = await normalizeLogoFile(file);
  const safeName = sanitizeFileName(normalizedFile.name || 'asset.png');
  const filePath = `${folder}/${pathPrefix}-${Date.now()}-${safeName}`;

  const { error } = await supabase.storage.from(CALENDAR_ASSET_BUCKET).upload(filePath, normalizedFile, {
    upsert: true,
    cacheControl: '3600',
  });

  if (error) {
    throw error;
  }

  const { data } = supabase.storage.from(CALENDAR_ASSET_BUCKET).getPublicUrl(filePath);
  return {
    publicUrl: data.publicUrl,
    storagePath: filePath,
  };
};

const removeStoredAsset = async (storagePath: string) => {
  const { error } = await supabase.storage.from(CALENDAR_ASSET_BUCKET).remove([storagePath]);

  if (error) {
    throw error;
  }
};

export const fetchLatestBranding = async () => {
  const { data, error } = await supabase
    .from('calendar_branding')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    throw error;
  }

  return (data?.[0] as CalendarBrandingRecord | undefined) ?? null;
};

export const fetchTeamAssets = async () => {
  const { data, error } = await supabase
    .from('calendar_team_assets')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  const records = (data ?? []) as CalendarTeamAssetRecord[];
  const bySlug: Record<string, CalendarTeamAssetRecord> = {};

  for (const record of records) {
    if (!bySlug[record.team_slug]) {
      bySlug[record.team_slug] = record;
    }
  }

  return bySlug;
};

export const fetchLatestCalendarProject = async () => {
  const { data, error } = await supabase
    .from('calendar_projects')
    .select('*')
    .order('updated_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as CalendarProjectRecord | null) ?? null;
};

export const fetchCalendarProjectTeamSources = async () => {
  const { data, error } = await supabase
    .from('calendar_projects')
    .select('matches,matches_text')
    .order('updated_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    throw error;
  }

  return (data ?? []) as CalendarProjectTeamSourceRecord[];
};

export const saveBranding = async ({
  brandingId,
  pageName,
  handle,
  existingLogoUrl,
  logoFile,
}: {
  brandingId?: string | null;
  pageName: string;
  handle: string;
  existingLogoUrl?: string | null;
  logoFile?: File | null;
}) => {
  let logoUrl = existingLogoUrl ?? null;

  if (logoFile) {
    const uploadedAsset = await uploadAsset('branding', 'page-logo', logoFile);
    logoUrl = uploadedAsset.publicUrl;
  }

  if (brandingId) {
    const { data, error } = await supabase
      .from('calendar_branding')
      .update({ page_name: pageName, handle, logo_url: logoUrl })
      .eq('id', brandingId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return data as CalendarBrandingRecord;
  }

  const { data, error } = await supabase
    .from('calendar_branding')
    .insert({ page_name: pageName, handle, logo_url: logoUrl })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data as CalendarBrandingRecord;
};

export const saveTeamAsset = async ({
  teamName,
  existingId,
  existingStoragePath,
  logoFile,
}: {
  teamName: string;
  existingId?: string;
  existingStoragePath?: string | null;
  logoFile: File;
}) => {
  const teamSlug = normalizeTeamSlug(teamName);
  const uploadedAsset = await uploadAsset('teams', teamSlug.toLowerCase().replace(/\s+/g, '-'), logoFile);
  let previousStoragePath = existingStoragePath ?? null;

  const cleanupUploadedAsset = async () => {
    try {
      await removeStoredAsset(uploadedAsset.storagePath);
    } catch (cleanupError) {
      console.warn('Nao foi possivel remover o escudo enviado apos falha no banco.', cleanupError);
    }
  };

  const cleanupPreviousAsset = async () => {
    if (!previousStoragePath || previousStoragePath === uploadedAsset.storagePath) {
      return;
    }

    try {
      await removeStoredAsset(previousStoragePath);
    } catch (cleanupError) {
      console.warn('Escudo novo salvo, mas nao foi possivel remover o arquivo antigo do Storage.', cleanupError);
    }
  };

  if (existingId) {
    const { data, error } = await supabase
      .from('calendar_team_assets')
      .update({ team_name: teamName, team_slug: teamSlug, logo_url: uploadedAsset.publicUrl, storage_path: uploadedAsset.storagePath })
      .eq('id', existingId)
      .select()
      .single();

    if (error) {
      await cleanupUploadedAsset();
      throw error;
    }

    await cleanupPreviousAsset();
    return data as CalendarTeamAssetRecord;
  }

  const { data: existingRecord } = await supabase
    .from('calendar_team_assets')
    .select('*')
    .eq('team_slug', teamSlug)
    .order('created_at', { ascending: false })
    .limit(1);

  const latestExisting = (existingRecord?.[0] as CalendarTeamAssetRecord | undefined) ?? null;
  previousStoragePath = latestExisting?.storage_path ?? previousStoragePath;

  if (latestExisting) {
    const { data, error } = await supabase
      .from('calendar_team_assets')
      .update({ team_name: teamName, team_slug: teamSlug, logo_url: uploadedAsset.publicUrl, storage_path: uploadedAsset.storagePath })
      .eq('id', latestExisting.id)
      .select()
      .single();

    if (error) {
      await cleanupUploadedAsset();
      throw error;
    }

    await cleanupPreviousAsset();
    return data as CalendarTeamAssetRecord;
  }

  const { data, error } = await supabase
    .from('calendar_team_assets')
    .insert({ team_name: teamName, team_slug: teamSlug, logo_url: uploadedAsset.publicUrl, storage_path: uploadedAsset.storagePath })
    .select()
    .single();

  if (error) {
    await cleanupUploadedAsset();
    throw error;
  }

  return data as CalendarTeamAssetRecord;
};

export const removeTeamAsset = async ({
  assetId,
  storagePath,
}: {
  assetId: string;
  storagePath?: string | null;
}) => {
  const { error } = await supabase.from('calendar_team_assets').delete().eq('id', assetId);

  if (error) {
    throw error;
  }

  if (!storagePath) {
    return;
  }

  try {
    await removeStoredAsset(storagePath);
  } catch (cleanupError) {
    console.warn('Registro removido, mas nao foi possivel remover o escudo do Storage.', cleanupError);
  }
};

export const saveCalendarProject = async ({
  projectId,
  projectName,
  month,
  year,
  matchesText,
  matches,
  calendarFormat,
  visualSettings,
  brandingId,
}: {
  projectId?: string | null;
  projectName: string;
  month: string;
  year: string;
  matchesText: string;
  matches: CalendarProjectMatchRecord[];
  calendarFormat: PalmeirasCalendarSettings['canvasFormat'];
  visualSettings: PersistedCalendarVisualSettings;
  brandingId?: string | null;
}) => {
  const payload = {
    project_name: projectName.trim() || 'Calendário sem nome',
    month,
    year,
    matches,
    matches_text: matchesText,
    calendar_format: calendarFormat,
    visual_settings: visualSettings,
    branding_id: brandingId ?? null,
  };

  const query = projectId
    ? supabase.from('calendar_projects').update(payload).eq('id', projectId)
    : supabase.from('calendar_projects').insert(payload);

  const { data, error } = await query.select().single();

  if (error) {
    throw error;
  }

  return data as CalendarProjectRecord;
};
