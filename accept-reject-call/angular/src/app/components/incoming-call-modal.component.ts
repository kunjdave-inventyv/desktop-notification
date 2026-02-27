// import { Component, Input, Output, EventEmitter } from '@angular/core';
// import { CommonModule } from '@angular/common';

// @Component({
//   selector: 'app-incoming-call-modal',
//   standalone: true,
//   imports: [CommonModule],
//   template: `
//     <div class="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center px-4">
//       <div class="bg-gray-900 border border-gray-700 rounded-3xl p-8 w-full max-w-xs text-center animate-fade-in shadow-2xl">
//         <!-- Pulsing avatar -->
//         <div class="relative flex items-center justify-center mb-6">
//           <div class="absolute w-24 h-24 rounded-full bg-green-500/10 animate-ping"></div>
//           <div class="absolute w-20 h-20 rounded-full bg-green-500/20 animate-ring-pulse"></div>
//           <div class="relative w-16 h-16 rounded-full bg-green-600 flex items-center justify-center z-10">
//             <svg class="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
//               <path stroke-linecap="round" stroke-linejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
//             </svg>
//           </div>
//         </div>

//         <p class="text-xs font-medium uppercase tracking-widest text-gray-500 mb-1">Incoming Call</p>
//         <p class="text-2xl font-bold text-white mb-1">{{ from }}</p>
//         <p class="text-sm text-gray-400 mb-8">is calling you...</p>

//         <div class="flex gap-3">
//           <button
//             (click)="reject.emit()"
//             class="flex-1 flex items-center justify-center gap-2 bg-red-600 hover:bg-red-500 text-white font-semibold rounded-xl py-3 text-sm transition-colors"
//           >
//             <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
//               <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
//             </svg>
//             Decline
//           </button>
//           <button
//             (click)="accept.emit()"
//             class="flex-1 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-500 text-white font-semibold rounded-xl py-3 text-sm transition-colors"
//           >
//             <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
//               <path stroke-linecap="round" stroke-linejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
//             </svg>
//             Accept
//           </button>
//         </div>
//       </div>
//     </div>
//   `
// })
// export class IncomingCallModalComponent {
//   @Input() from: string = '';
//   @Output() accept = new EventEmitter<void>();
//   @Output() reject = new EventEmitter<void>();
// }

import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-incoming-call-modal',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center px-4">
      <div class="bg-gray-900 border border-gray-700 rounded-3xl p-8 w-full max-w-xs text-center animate-fade-in shadow-2xl">

        <!-- Pulsing avatar -->
        <div class="relative flex items-center justify-center mb-6">
          <div class="absolute w-24 h-24 rounded-full bg-green-500/10 animate-ping"></div>
          <div class="absolute w-20 h-20 rounded-full bg-green-500/20 animate-ring-pulse"></div>
          <div class="relative w-16 h-16 rounded-full bg-green-600 flex items-center justify-center z-10">
            <svg class="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round"
                d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
          </div>
        </div>

        <p class="text-xs font-medium uppercase tracking-widest text-gray-500 mb-1">Incoming Call</p>
        <p class="text-2xl font-bold text-white mb-1">{{ from }}</p>
        <p class="text-sm text-gray-400 mb-8">is calling you...</p>

        <div class="flex gap-3">
          <button
            (click)="reject.emit()"
            class="flex-1 flex items-center justify-center gap-2 bg-red-600 hover:bg-red-500 text-white font-semibold rounded-xl py-3 text-sm transition-colors"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            Decline
          </button>
          <button
            (click)="accept.emit()"
            class="flex-1 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-500 text-white font-semibold rounded-xl py-3 text-sm transition-colors"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round"
                d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
            Accept
          </button>
        </div>

      </div>
    </div>
  `
})
export class IncomingCallModalComponent {
  @Input()  from   = '';
  @Output() accept = new EventEmitter<void>();
  @Output() reject = new EventEmitter<void>();
}