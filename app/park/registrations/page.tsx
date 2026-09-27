'use client';

import React from 'react';
import { ParkNav } from '@/components/park/ParkNav';
import { MinimalistRegistrationTracker } from '@/components/park/MinimalistRegistrationTracker';

export default function ParkRegistrationsPage() {
  return (
    <div className="min-h-screen bg-[#07070a] text-white flex flex-col font-sans selection:bg-cyan-500/30 selection:text-white">
      <ParkNav />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <MinimalistRegistrationTracker />
      </main>
    </div>
  );
}
