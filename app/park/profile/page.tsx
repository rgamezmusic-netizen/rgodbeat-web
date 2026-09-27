'use client';

import React, { useState, useEffect } from 'react';
import { ParkNav } from '@/components/park/ParkNav';
import { ParkStorage } from '@/lib/park/storage';
import { MasterProfile, UserRole } from '@/lib/park/types';
import { ShieldCheck, Save, CheckCircle2, UserCircle2, Building2, Globe, FileCheck } from 'lucide-react';

const AVAILABLE_ROLES: UserRole[] = [
  'Producer',
  'Recording Artist',
  'Songwriter',
  'Composer',
  'Publisher',
  'Record Label',
  'Sound Recording Owner',
  'Manager',
];

export default function MasterProfilePage() {
  const [profile, setProfile] = useState<MasterProfile | null>(null);
  const [isClient, setIsClient] = useState(false);
  const [saveToast, setSaveToast] = useState(false);

  useEffect(() => {
    setIsClient(true);
    setProfile(ParkStorage.getMasterProfile());
  }, []);

  if (!isClient || !profile) {
    return (
      <div className="min-h-screen bg-[#07070a] text-white flex items-center justify-center font-mono">
        <div className="w-8 h-8 rounded-full border-2 border-cyan-500/20 border-t-cyan-500 animate-spin" />
      </div>
    );
  }

  const handleToggleRole = (role: UserRole) => {
    const currentRoles = profile.roles || [];
    if (currentRoles.includes(role)) {
      setProfile({ ...profile, roles: currentRoles.filter((r) => r !== role) });
    } else {
      setProfile({ ...profile, roles: [...currentRoles, role] });
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    ParkStorage.saveMasterProfile(profile);
    setSaveToast(true);
    setTimeout(() => setSaveToast(false), 2500);
  };

  return (
    <div className="min-h-screen bg-[#07070a] text-white flex flex-col font-sans selection:bg-cyan-500/30 selection:text-white">
      <ParkNav />

      <main className="flex-1 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-mono uppercase tracking-widest text-cyan-400 font-bold px-2 py-0.5 rounded bg-cyan-950/60 border border-cyan-500/30">
                MASTER PROFILE // DERECHOS PERMANENTES
              </span>
            </div>
            <h1 className="text-2xl sm:text-4xl font-extrabold font-display text-white">
              Perfil Maestro de Titularidad
            </h1>
            <p className="text-xs text-zinc-400 font-sans mt-0.5">
              Ingresa tus datos una sola vez. The Park los reutilizará automáticamente en todos tus proyectos, obras y registros oficiales.
            </p>
          </div>

          <button
            type="button"
            onClick={handleSave}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-400 hover:from-cyan-400 hover:to-teal-300 text-black font-mono font-bold text-xs uppercase tracking-wider flex items-center gap-2 shadow-lg active:scale-95 transition-all self-start sm:self-auto cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>{saveToast ? '¡Guardado con Éxito!' : 'Guardar Master Profile'}</span>
          </button>
        </div>

        {/* Form Container */}
        <form onSubmit={handleSave} className="space-y-6">
          {/* Section 1: Identidad & Nombres */}
          <div className="p-6 sm:p-8 rounded-3xl bg-[#0c0c14] border border-zinc-800 space-y-4">
            <h3 className="text-sm font-bold font-mono uppercase text-white flex items-center gap-2 border-b border-zinc-850 pb-2">
              <UserCircle2 className="w-4 h-4 text-cyan-400" />
              <span>01. Identidad Legal y Artística</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-mono text-zinc-400 uppercase mb-1">
                  Nombre Legal Completo (Como aparece en tu documento oficial)
                </label>
                <input
                  type="text"
                  required
                  value={profile.legalName}
                  onChange={(e) => setProfile({ ...profile, legalName: e.target.value })}
                  className="w-full h-10 px-3 rounded-xl bg-zinc-900 border border-zinc-750 text-white font-mono text-xs focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono text-zinc-400 uppercase mb-1">
                  Nombre Profesional / Artístico Principal
                </label>
                <input
                  type="text"
                  required
                  value={profile.professionalName}
                  onChange={(e) => setProfile({ ...profile, professionalName: e.target.value })}
                  className="w-full h-10 px-3 rounded-xl bg-zinc-900 border border-zinc-750 text-white font-mono text-xs focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono text-zinc-400 uppercase mb-1">
                  Nombre de Productor (Créditos de Producción)
                </label>
                <input
                  type="text"
                  value={profile.producerName}
                  onChange={(e) => setProfile({ ...profile, producerName: e.target.value })}
                  className="w-full h-10 px-3 rounded-xl bg-zinc-900 border border-zinc-750 text-white font-mono text-xs focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono text-zinc-400 uppercase mb-1">
                  Nombre de Artista Vocal (Si también cantas/rapeas)
                </label>
                <input
                  type="text"
                  value={profile.artistName}
                  onChange={(e) => setProfile({ ...profile, artistName: e.target.value })}
                  className="w-full h-10 px-3 rounded-xl bg-zinc-900 border border-zinc-750 text-white font-mono text-xs focus:outline-none focus:border-cyan-400"
                />
              </div>
            </div>

            {/* Roles Picker */}
            <div className="pt-2">
              <label className="block text-[10px] font-mono text-zinc-400 uppercase mb-2">
                Roles Activos en tu Carrera Musical (Selecciona todos los que apliquen)
              </label>
              <div className="flex flex-wrap gap-2">
                {AVAILABLE_ROLES.map((role) => {
                  const isSelected = (profile.roles || []).includes(role);
                  return (
                    <button
                      key={role}
                      type="button"
                      onClick={() => handleToggleRole(role)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all border cursor-pointer ${
                        isSelected
                          ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-sm'
                          : 'bg-zinc-900 text-zinc-500 border-zinc-800 hover:text-zinc-300'
                      }`}
                    >
                      {isSelected ? '✓ ' : '+ '} {role}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Section 2: Identificadores de Derechos & PROs */}
          <div className="p-6 sm:p-8 rounded-3xl bg-[#0c0c14] border border-zinc-800 space-y-4">
            <h3 className="text-sm font-bold font-mono uppercase text-white flex items-center gap-2 border-b border-zinc-850 pb-2">
              <FileCheck className="w-4 h-4 text-cyan-400" />
              <span>02. Identificadores de Derechos Oficiales</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-[10px] font-mono text-zinc-400 uppercase mb-1">
                  Número IPI / CAE (9 a 11 dígitos)
                </label>
                <input
                  type="text"
                  placeholder="Ej. 00812345678"
                  value={profile.ipiCaeNumber || ''}
                  onChange={(e) => setProfile({ ...profile, ipiCaeNumber: e.target.value })}
                  className="w-full h-10 px-3 rounded-xl bg-zinc-900 border border-zinc-750 text-white font-mono text-xs focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono text-zinc-400 uppercase mb-1">
                  Sociedad de Gestión (PRO)
                </label>
                <select
                  value={profile.proAffiliation || 'BMI'}
                  onChange={(e) => setProfile({ ...profile, proAffiliation: e.target.value as any })}
                  className="w-full h-10 px-3 rounded-xl bg-zinc-900 border border-zinc-750 text-white font-mono text-xs focus:outline-none focus:border-cyan-400"
                >
                  <option value="BMI">BMI (Broadcast Music, Inc.)</option>
                  <option value="ASCAP">ASCAP</option>
                  <option value="SESAC">SESAC</option>
                  <option value="SGAE">SGAE</option>
                  <option value="Other">Otra</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-mono text-zinc-400 uppercase mb-1">
                  Nº de Miembro en tu PRO
                </label>
                <input
                  type="text"
                  placeholder="Ej. BMI Member ID..."
                  value={profile.proMemberId || ''}
                  onChange={(e) => setProfile({ ...profile, proMemberId: e.target.value })}
                  className="w-full h-10 px-3 rounded-xl bg-zinc-900 border border-zinc-750 text-white font-mono text-xs focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono text-zinc-400 uppercase mb-1">
                  Membresía The MLC (Regalías Mecánicas)
                </label>
                <input
                  type="text"
                  placeholder="Ej. MLC Member ID..."
                  value={profile.mlcMemberId || ''}
                  onChange={(e) => setProfile({ ...profile, mlcMemberId: e.target.value })}
                  className="w-full h-10 px-3 rounded-xl bg-zinc-900 border border-zinc-750 text-white font-mono text-xs focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono text-zinc-400 uppercase mb-1">
                  ID de Miembro SoundExchange (Masters)
                </label>
                <input
                  type="text"
                  placeholder="Ej. SX Account #..."
                  value={profile.soundExchangeId || ''}
                  onChange={(e) => setProfile({ ...profile, soundExchangeId: e.target.value })}
                  className="w-full h-10 px-3 rounded-xl bg-zinc-900 border border-zinc-750 text-white font-mono text-xs focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono text-zinc-400 uppercase mb-1">
                  Código de Registrador ISRC (Si tienes)
                </label>
                <input
                  type="text"
                  placeholder="Ej. US-QZ... (3 letras)"
                  value={profile.isrcRegistrantCode || ''}
                  onChange={(e) => setProfile({ ...profile, isrcRegistrantCode: e.target.value })}
                  className="w-full h-10 px-3 rounded-xl bg-zinc-900 border border-zinc-750 text-white font-mono text-xs focus:outline-none focus:border-cyan-400"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Entidades Editoriales y Empresas */}
          <div className="p-6 sm:p-8 rounded-3xl bg-[#0c0c14] border border-zinc-800 space-y-4">
            <h3 className="text-sm font-bold font-mono uppercase text-white flex items-center gap-2 border-b border-zinc-850 pb-2">
              <Building2 className="w-4 h-4 text-cyan-400" />
              <span>03. Editora, Sello y Empresa</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-[10px] font-mono text-zinc-400 uppercase mb-1">
                  Nombre de Editora Musical (Publishing Entity)
                </label>
                <input
                  type="text"
                  placeholder="Ej. Gamez Music / RGODBEAT Publishing"
                  value={profile.publisherName || ''}
                  onChange={(e) => setProfile({ ...profile, publisherName: e.target.value })}
                  className="w-full h-10 px-3 rounded-xl bg-zinc-900 border border-zinc-750 text-white font-mono text-xs focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono text-zinc-400 uppercase mb-1">
                  IPI / CAE de la Editora
                </label>
                <input
                  type="text"
                  placeholder="IPI de tu editorial..."
                  value={profile.publisherIpi || ''}
                  onChange={(e) => setProfile({ ...profile, publisherIpi: e.target.value })}
                  className="w-full h-10 px-3 rounded-xl bg-zinc-900 border border-zinc-750 text-white font-mono text-xs focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono text-zinc-400 uppercase mb-1">
                  Nombre del Sello Discográfico (Record Label)
                </label>
                <input
                  type="text"
                  placeholder="Ej. RGODBEAT Records"
                  value={profile.labelName || ''}
                  onChange={(e) => setProfile({ ...profile, labelName: e.target.value })}
                  className="w-full h-10 px-3 rounded-xl bg-zinc-900 border border-zinc-750 text-white font-mono text-xs focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono text-zinc-400 uppercase mb-1">
                  Razón Social / Empresa Legal (LLC / Corp)
                </label>
                <input
                  type="text"
                  placeholder="Ej. Gamez IN LLC"
                  value={profile.companyName || ''}
                  onChange={(e) => setProfile({ ...profile, companyName: e.target.value })}
                  className="w-full h-10 px-3 rounded-xl bg-zinc-900 border border-zinc-750 text-white font-mono text-xs focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono text-zinc-400 uppercase mb-1">
                  Correo Electrónico de Contacto
                </label>
                <input
                  type="email"
                  required
                  value={profile.email}
                  onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                  className="w-full h-10 px-3 rounded-xl bg-zinc-900 border border-zinc-750 text-white font-mono text-xs focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono text-zinc-400 uppercase mb-1">
                  País y Estado
                </label>
                <input
                  type="text"
                  value={`${profile.country}${profile.state ? `, ${profile.state}` : ''}`}
                  onChange={(e) => setProfile({ ...profile, country: e.target.value })}
                  className="w-full h-10 px-3 rounded-xl bg-zinc-900 border border-zinc-750 text-white font-mono text-xs focus:outline-none focus:border-cyan-400"
                />
              </div>
            </div>
          </div>

          {/* Bottom CTA */}
          <div className="flex justify-end pt-2">
            <button
              type="submit"
              className="px-6 py-3 rounded-2xl bg-gradient-to-r from-cyan-500 to-teal-400 hover:from-cyan-400 hover:to-teal-300 text-black font-mono font-bold text-xs uppercase tracking-wider flex items-center gap-2 shadow-lg active:scale-95 transition-all cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>{saveToast ? '¡Cambios Guardados!' : 'Guardar Master Profile'}</span>
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
