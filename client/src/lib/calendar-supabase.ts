import { supabase } from '@/lib/supabase';

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
  created_at: string;
}

export interface CalendarProjectRecord {
  id: string;
  month: string;
  year: string;
  matches_text: string;
  branding_id: string | null;
  created_at: string;
}

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
  return data.publicUrl;
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
    logoUrl = await uploadAsset('branding', 'page-logo', logoFile);
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
  logoFile,
}: {
  teamName: string;
  existingId?: string;
  logoFile: File;
}) => {
  const teamSlug = normalizeTeamSlug(teamName);
  const logoUrl = await uploadAsset('teams', teamSlug.toLowerCase().replace(/\s+/g, '-'), logoFile);

  if (existingId) {
    const { data, error } = await supabase
      .from('calendar_team_assets')
      .update({ team_name: teamName, team_slug: teamSlug, logo_url: logoUrl })
      .eq('id', existingId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return data as CalendarTeamAssetRecord;
  }

  const { data: existingRecord } = await supabase
    .from('calendar_team_assets')
    .select('*')
    .eq('team_slug', teamSlug)
    .order('created_at', { ascending: false })
    .limit(1);

  const latestExisting = (existingRecord?.[0] as CalendarTeamAssetRecord | undefined) ?? null;

  if (latestExisting) {
    const { data, error } = await supabase
      .from('calendar_team_assets')
      .update({ team_name: teamName, team_slug: teamSlug, logo_url: logoUrl })
      .eq('id', latestExisting.id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return data as CalendarTeamAssetRecord;
  }

  const { data, error } = await supabase
    .from('calendar_team_assets')
    .insert({ team_name: teamName, team_slug: teamSlug, logo_url: logoUrl })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data as CalendarTeamAssetRecord;
};

export const saveCalendarProject = async ({
  month,
  year,
  matchesText,
  brandingId,
}: {
  month: string;
  year: string;
  matchesText: string;
  brandingId?: string | null;
}) => {
  const { data, error } = await supabase
    .from('calendar_projects')
    .insert({
      month,
      year,
      matches_text: matchesText,
      branding_id: brandingId ?? null,
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data as CalendarProjectRecord;
};
