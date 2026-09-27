'use client';

import React, { useState } from 'react';
import { ParkProject, RegistrationService, RegistrationStatus, MasterProfile } from '@/lib/park/types';
import { analyzeProject, ServiceGuidance } from '@/lib/park/engine';
import { ServiceDetailModal } from './ServiceDetailModal';
import { CheckCircle2, AlertCircle, Clock, ShieldCheck, ChevronRight, FileCheck2, AlertTriangle, MinusCircle } from 'lucide-react';

interface RegistrationChecklistProps {
  project: ParkProject;
  profile?: MasterProfile | null;
  onUpdateRegistration: (
    service: RegistrationService,
    patch: {
      status: RegistrationStatus;
      externalReferenceId?: string;
      registrationNumber?: string;
      notes?: string;
    }
  ) => void;
}

export function RegistrationChecklist({
  project,
  profile,
  onUpdateRegistration,
}: RegistrationChecklistProps) {
  const analysis = analyzeProject(project, profile);
  const [selectedService, setSelectedService] = useState<ServiceGuidance | null>(null);

  const getStatusBadge = (status: RegistrationStatus) => {
    switch (status) {
      case 'REGISTERED':
      case 'VERIFIED':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            <span>REGISTRADO</span>
          </span>
        );
      case 'SUBMITTED':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-blue-500/15 text-blue-400 border border-blue-500/30 flex items-center gap-1">
            <Clock className="w-3 h-3 text-blue-400" />
            <span>SOLICITUD ENVIADA</span>
          </span>
        );
      case 'READY_TO_REGISTER':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 flex items-center gap-1">
            <ShieldCheck className="w-3 h-3 text-cyan-400" />
            <span>LISTO PARA REGISTRAR</span>
          </span>
        );
      case 'MISSING_INFORMATION':
      case 'USER_ACTION_REQUIRED':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1">
            <AlertCircle className="w-3 h-3 text-amber-400" />
            <span>FALTAN DATOS</span>
          </span>
        );
      case 'NEEDS_ATTENTION':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-orange-500/15 text-orange-300 border border-orange-500/30 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 text-orange-400" />
            <span>REVISIÓN REQUERIDA</span>
          </span>
        );
      case 'NOT_APPLICABLE':
      default:
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono text-zinc-500 bg-zinc-900 border border-zinc-800 flex items-center gap-1">
            <MinusCircle className="w-3 h-3" />
            <span>NO APLICA AÚN</span>
          </span>
        );
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
        <div>
          <span className="text-[10px] font-mono uppercase tracking-widest text-cyan-400 font-bold">
            CHECKLIST CENTRAL DE DERECHOS
          </span>
          <h3 className="text-base sm:text-lg font-bold text-white font-mono">
            Registros y Protección Legal
          </h3>
        </div>

        <div className="flex items-center gap-2 bg-zinc-900 px-3 py-1.5 rounded-xl border border-zinc-800">
          <span className="text-[11px] font-mono text-zinc-400">Progreso Aplicable:</span>
          <span className="text-xs font-mono font-black text-cyan-400">
            {analysis.readinessPercentage}%
          </span>
        </div>
      </div>

      {/* Services List */}
      <div className="space-y-2.5">
        {analysis.services.map((item) => {
          const isNotApplicable = item.currentStatus === 'NOT_APPLICABLE';
          const regData = project.registrations[item.service];

          return (
            <div
              key={item.service}
              onClick={() => setSelectedService(item)}
              className={`p-3.5 sm:p-4 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer select-none group ${
                isNotApplicable
                  ? 'bg-zinc-950/40 border-zinc-850/80 opacity-60 hover:opacity-100 hover:border-zinc-700'
                  : item.currentStatus === 'REGISTERED' || item.currentStatus === 'VERIFIED'
                  ? 'bg-emerald-950/20 border-emerald-500/30 hover:border-emerald-500/60'
                  : item.currentStatus === 'NEEDS_ATTENTION'
                  ? 'bg-orange-950/20 border-orange-500/30 hover:border-orange-500/60'
                  : 'bg-zinc-900/60 border-zinc-800 hover:border-cyan-500/40 hover:bg-zinc-900/90'
              }`}
            >
              <div className="flex items-start gap-3 min-w-0">
                <div className="pt-0.5">
                  <FileCheck2 className={`w-4 h-4 ${
                    isNotApplicable ? 'text-zinc-600' : 'text-cyan-400 group-hover:scale-110 transition-transform'
                  }`} />
                </div>

                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold font-mono text-white truncate">
                      {item.name}
                    </span>
                    <span className="text-[9px] font-mono text-zinc-500 hidden sm:inline">
                      · {item.category}
                    </span>
                  </div>

                  <p className="text-[11px] text-zinc-400 truncate max-w-xl font-sans">
                    {regData?.registrationNumber
                      ? `Ref: ${regData.registrationNumber}`
                      : regData?.notes
                      ? regData.notes
                      : item.whatItIs}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
                {getStatusBadge(item.currentStatus)}
                <ChevronRight className="w-4 h-4 text-zinc-500 group-hover:text-cyan-400 group-hover:translate-x-0.5 transition-all" />
              </div>
            </div>
          );
        })}
      </div>

      {/* Detail Modal */}
      {selectedService && (
        <ServiceDetailModal
          isOpen={!!selectedService}
          onClose={() => setSelectedService(null)}
          serviceGuidance={selectedService}
          project={project}
          profile={profile}
          onSaveRegistration={onUpdateRegistration}
        />
      )}
    </div>
  );
}
