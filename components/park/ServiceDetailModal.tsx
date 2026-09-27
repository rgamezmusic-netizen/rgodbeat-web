'use client';

import React, { useState } from 'react';
import { RegistrationService, RegistrationStatus, ParkProject, MasterProfile } from '@/lib/park/types';
import { ServiceGuidance } from '@/lib/park/engine';
import { X, ExternalLink, ShieldCheck, CheckCircle2, AlertTriangle, Clock, ArrowRight, Save, FileText } from 'lucide-react';

interface ServiceDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  serviceGuidance: ServiceGuidance;
  project: ParkProject;
  profile?: MasterProfile | null;
  onSaveRegistration: (
    service: RegistrationService,
    patch: {
      status: RegistrationStatus;
      externalReferenceId?: string;
      registrationNumber?: string;
      notes?: string;
    }
  ) => void;
}

export function ServiceDetailModal({
  isOpen,
  onClose,
  serviceGuidance,
  project,
  profile,
  onSaveRegistration,
}: ServiceDetailModalProps) {
  const currentReg = project.registrations[serviceGuidance.service];

  const [status, setStatus] = useState<RegistrationStatus>(currentReg?.status || serviceGuidance.currentStatus);
  const [refId, setRefId] = useState<string>(currentReg?.externalReferenceId || '');
  const [regNum, setRegNum] = useState<string>(currentReg?.registrationNumber || '');
  const [notes, setNotes] = useState<string>(currentReg?.notes || '');
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleSave = () => {
    let finalStatus = status;
    // Auto-update status intelligently if real numbers entered
    if (regNum.trim() && finalStatus !== 'VERIFIED') {
      finalStatus = 'REGISTERED';
    } else if (refId.trim() && finalStatus === 'NOT_STARTED') {
      finalStatus = 'SUBMITTED';
    }

    onSaveRegistration(serviceGuidance.service, {
      status: finalStatus,
      externalReferenceId: refId.trim() || undefined,
      registrationNumber: regNum.trim() || undefined,
      notes: notes.trim() || undefined,
    });

    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl max-h-[90vh] bg-[#0d0d14] border border-zinc-700/80 rounded-3xl shadow-2xl overflow-y-auto p-6 sm:p-8 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-zinc-800 pb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-mono uppercase tracking-widest text-cyan-400 font-bold px-2 py-0.5 rounded bg-cyan-950/60 border border-cyan-500/30">
                {serviceGuidance.category}
              </span>
              <span className="text-xs font-mono text-zinc-400">Proyecto: <strong className="text-white">{project.title}</strong></span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold font-display text-white">
              {serviceGuidance.name}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="text-zinc-400 hover:text-white p-1 rounded-xl hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 1. What it is */}
        <div className="space-y-1 bg-zinc-950/60 p-4 rounded-2xl border border-zinc-850">
          <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-bold">
            ¿Qué es este registro?
          </span>
          <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed font-sans">
            {serviceGuidance.whatItIs}
          </p>
        </div>

        {/* 2. When it applies */}
        <div className="space-y-1 bg-zinc-950/60 p-4 rounded-2xl border border-zinc-850">
          <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-bold">
            ¿Cuándo aplica en The Park?
          </span>
          <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed font-sans">
            {serviceGuidance.whenItApplies}
          </p>
        </div>

        {/* 3. Missing Fields Alert (if any) */}
        {serviceGuidance.missingFields.length > 0 && serviceGuidance.currentStatus !== 'NOT_APPLICABLE' && (
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-2">
            <div className="flex items-center gap-2 text-amber-300 font-mono text-xs font-bold">
              <AlertTriangle className="w-4 h-4" />
              <span>INFORMACIÓN PENDIENTE PARA COMPLETAR:</span>
            </div>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs text-amber-200/90 font-mono pl-6 list-disc">
              {serviceGuidance.missingFields.map((field, idx) => (
                <li key={idx}>{field}</li>
              ))}
            </ul>
          </div>
        )}

        {/* 4. Action Guide: What to do & Where to go */}
        <div className="space-y-3 p-4 rounded-2xl bg-[#12121c] border border-cyan-500/20">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase tracking-wider text-cyan-400 font-bold">
              Instrucciones Oficiales (Flujo Asistido)
            </span>
            <a
              href={serviceGuidance.officialUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-cyan-300 hover:text-cyan-200 underline"
            >
              <span>Abrir Portal Oficial</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>

          <p className="text-xs text-zinc-300 leading-relaxed">
            {serviceGuidance.whatToDo}
          </p>

          <div className="text-xs font-mono text-zinc-400 border-t border-zinc-800 pt-2">
            <strong className="text-zinc-200">Qué guardar al finalizar:</strong> {serviceGuidance.whatToReturn}
          </div>
        </div>

        {/* 5. Real Record Entry (NO FAKE IDs) */}
        <div className="space-y-4 pt-2 border-t border-zinc-800">
          <h4 className="text-xs font-mono font-bold uppercase text-white tracking-wider">
            Registrar Datos Reales Obtenidos
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-mono text-zinc-400 uppercase mb-1">
                Estado del Proceso
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as RegistrationStatus)}
                className="w-full h-10 px-3 rounded-xl bg-zinc-900 border border-zinc-750 text-white font-mono text-xs focus:outline-none focus:border-cyan-400"
              >
                <option value="NOT_STARTED">NO INICIADO</option>
                <option value="READY_TO_REGISTER">LISTO PARA REGISTRAR</option>
                <option value="USER_ACTION_REQUIRED">ACCIÓN REQUERIDA</option>
                <option value="SUBMITTED">SOLICITUD ENVIADA (SUBMITTED)</option>
                <option value="REGISTERED">REGISTRADO (CON NÚMERO OFICIAL)</option>
                <option value="VERIFIED">VERIFICADO</option>
                <option value="NOT_APPLICABLE">NO APLICA AÚN</option>
                <option value="NEEDS_ATTENTION">REVISIÓN REQUERIDA</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-mono text-zinc-400 uppercase mb-1">
                Nº de Solicitud / Caso / Ref. Externa
              </label>
              <input
                type="text"
                placeholder="Ej. Case # 1-12345678"
                value={refId}
                onChange={(e) => setRefId(e.target.value)}
                className="w-full h-10 px-3 rounded-xl bg-zinc-900 border border-zinc-750 text-white font-mono text-xs focus:outline-none focus:border-cyan-400"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-mono text-zinc-400 uppercase mb-1">
              Nº de Registro Final Concedido (Certificado / BMI Work # / ISRC / Asset ID)
            </label>
            <input
              type="text"
              placeholder="Ej. PA0002345678 / US-QZ... / BMI Work #987654"
              value={regNum}
              onChange={(e) => setRegNum(e.target.value)}
              className="w-full h-10 px-3 rounded-xl bg-zinc-900 border border-zinc-750 text-white font-mono text-xs focus:outline-none focus:border-cyan-400"
            />
          </div>

          <div>
            <label className="block text-[10px] font-mono text-zinc-400 uppercase mb-1">
              Notas y Detalles del Trámite
            </label>
            <textarea
              rows={2}
              placeholder="Detalles sobre tasas abonadas, titulares declarados o fechas..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full p-2.5 rounded-xl bg-zinc-900 border border-zinc-750 text-white font-mono text-xs focus:outline-none focus:border-cyan-400 resize-none"
            />
          </div>
        </div>

        {/* Buttons */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-mono text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleSave}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-400 hover:from-cyan-400 hover:to-teal-300 text-black font-mono font-bold text-xs uppercase tracking-wider flex items-center gap-2 shadow-md active:scale-95 cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>{savedSuccess ? '¡Guardado!' : 'Guardar Datos en The Park'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
