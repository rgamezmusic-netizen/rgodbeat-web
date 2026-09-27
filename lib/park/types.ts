/**
 * THE PARK — MASTER RIGHTS & RELEASE CONTROL CENTER
 * Core domain types & lifecycle definitions.
 * 
 * 100% isolated from RGodbeat Studio.
 */

export type ProjectType = 'beat' | 'full_song' | 'remix' | 'sample_pack';

export type ProjectStage = 
  | 'beat_instrumental' // Producer instrumental (e.g. DIVINA)
  | 'full_song'         // Song with lyrics, vocalists, songwriters, splits
  | 'final_master'      // Mastered audio ready for technical tagging
  | 'isrc_assigned'     // ISRC assigned to the specific master
  | 'release_ready'     // Metadata, artwork, UPC complete
  | 'distributed';      // Submitted/live on Symphonic

export type RegistrationService = 
  | 'copyright_musical_work'   // U.S. Copyright Office - PA (Work of the Performing Arts)
  | 'copyright_sound_recording'// U.S. Copyright Office - SR (Sound Recording)
  | 'bmi'                      // BMI (Broadcast Music, Inc.) - Performing Rights
  | 'mlc'                      // The MLC - Mechanical Licensing Collective
  | 'soundexchange'            // SoundExchange - Digital Performance Royalties for Masters
  | 'isrc'                     // ISRC Assignment
  | 'upc'                      // UPC / Barcode for Release
  | 'symphonic'                // Symphonic Distribution Submission
  | 'youtube_content_id';      // YouTube Content ID & Rights Management

export type RegistrationStatus = 
  | 'NOT_STARTED'
  | 'MISSING_INFORMATION'
  | 'READY_TO_REGISTER'
  | 'USER_ACTION_REQUIRED'
  | 'SUBMITTED'
  | 'REGISTERED'
  | 'VERIFIED'
  | 'NOT_APPLICABLE'
  | 'NEEDS_ATTENTION';

export type UserRole = 
  | 'Producer'
  | 'Recording Artist'
  | 'Songwriter'
  | 'Composer'
  | 'Publisher'
  | 'Record Label'
  | 'Sound Recording Owner'
  | 'Manager';

export interface MasterProfile {
  id: string;
  userId: string;
  // Identity
  legalName: string;
  professionalName: string;
  producerName: string;
  artistName: string;
  // Roles
  roles: UserRole[];
  // Rights Identifiers
  ipiCaeNumber?: string;       // 9-11 digit IPI / CAE
  isniNumber?: string;         // International Standard Name Identifier
  proAffiliation?: 'BMI' | 'ASCAP' | 'SESAC' | 'SGAE' | 'Other';
  proMemberId?: string;
  mlcMemberId?: string;
  soundExchangeId?: string;
  isrcRegistrantCode?: string; // 3-character registrant code (e.g. QZ...)
  // Organizations
  publisherName?: string;
  publisherIpi?: string;
  labelName?: string;
  companyName?: string;        // e.g. Gamez IN LLC / RGODBEAT
  // Contact
  email: string;
  phone?: string;
  country: string;
  state?: string;
  updatedAt: string;
}

export interface CollaboratorSplit {
  id: string;
  name: string;
  role: UserRole;
  sharePercentage: number; // e.g. 50%
  ipiNumber?: string;
  proAffiliation?: string;
  email?: string;
}

export interface ParkRegistration {
  service: RegistrationService;
  status: RegistrationStatus;
  externalReferenceId?: string; // Real confirmation code / application #
  registrationNumber?: string;  // Official granted registration #
  submittedDate?: string;
  registeredDate?: string;
  notes?: string;
  documentUrls?: string[];
  lastUpdated: string;
}

export interface ParkDocument {
  id: string;
  projectId?: string;
  title: string;
  category: 'certificate' | 'split_sheet' | 'contract' | 'confirmation' | 'audio_master' | 'artwork';
  service?: RegistrationService;
  fileUrl: string;
  fileName: string;
  fileSize?: number;
  uploadedAt: string;
  notes?: string;
}

export interface ParkAuditEvent {
  id: string;
  projectId: string;
  timestamp: string;
  userEmail: string;
  eventType: 'STAGE_CHANGED' | 'STATUS_CHANGED' | 'SPLIT_UPDATED' | 'METADATA_UPDATED' | 'DOCUMENT_ATTACHED';
  description: string;
  previousValue?: string;
  newValue?: string;
}

export interface ParkProject {
  id: string;
  slug: string;
  title: string;
  type: ProjectType;
  stage: ProjectStage;
  // Metadata
  bpm: number;
  key: string;
  scale?: 'Major' | 'Minor' | 'Custom';
  genre: string;
  mood?: string;
  durationSec?: number;
  // Credits & Rights
  producerName: string;
  primaryArtistName?: string;
  featuredArtists?: string[];
  songwriters?: string[];
  publishers?: string[];
  splits: CollaboratorSplit[];
  masterOwnershipPercentage: number; // Owner's share of sound recording
  publishingOwnershipPercentage: number; // Owner's share of composition
  // Identifiers (never invented, only stored if real)
  isrc?: string;
  upc?: string;
  catalogNumber?: string;
  // Files
  audioMasterUrl?: string;
  artworkUrl?: string;
  lyrics?: string;
  notes?: string;
  // Registrations Map
  registrations: Record<RegistrationService, ParkRegistration>;
  // Audit trail & Docs
  documents: ParkDocument[];
  auditHistory: ParkAuditEvent[];
  createdAt: string;
  updatedAt: string;
}
