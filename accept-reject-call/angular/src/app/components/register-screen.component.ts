// import { Component, Output, EventEmitter } from '@angular/core';
// import { CommonModule } from '@angular/common';
// import { FormsModule } from '@angular/forms';

// @Component({
//   selector: 'app-register-screen',
//   standalone: true,
//   imports: [CommonModule, FormsModule],
//   template: `
//     <div class="min-h-screen flex items-center justify-center bg-gray-950 px-4">
//       <div class="w-full max-w-sm">
//         <!-- Logo -->
//         <div class="text-center mb-10">
//           <div class="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-600 mb-4">
//             <svg class="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
//               <path stroke-linecap="round" stroke-linejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
//             </svg>
//           </div>
//           <h1 class="text-2xl font-bold text-white tracking-tight">Signal</h1>
//           <p class="text-gray-400 text-sm mt-1">Peer-to-peer calling over WebSocket</p>
//         </div>

//         <!-- Card -->
//         <div class="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
//           <div>
//             <label class="block text-xs font-medium text-gray-400 mb-1.5">Your User ID</label>
//             <input
//               type="text"
//               [(ngModel)]="userId"
//               placeholder="e.g. alice"
//               class="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
//             />
//           </div>

//           <div>
//             <label class="block text-xs font-medium text-gray-400 mb-1.5">Peer User ID (who you want to call)</label>
//             <input
//               type="text"
//               [(ngModel)]="peerId"
//               placeholder="e.g. bob"
//               class="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
//             />
//           </div>

//           <button
//             (click)="handleSubmit()"
//             [disabled]="!userId.trim() || !peerId.trim()"
//             class="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-lg py-2.5 text-sm transition-colors"
//           >
//             Connect
//           </button>
//         </div>

//         <p class="text-center text-xs text-gray-600 mt-4">
//           Open this app in two tabs with opposite IDs to test
//         </p>
//       </div>
//     </div>
//   `
// })
// export class RegisterScreenComponent {
//   @Output() register = new EventEmitter<{ userId: string; peerId: string }>();

//   userId = '';
//   peerId = '';

//   handleSubmit(): void {
//     const u = this.userId.trim();
//     const p = this.peerId.trim();
//     if (!u || !p) return;
//     if (u === p) {
//       alert('Your ID and peer ID cannot be the same.');
//       return;
//     }
//     this.register.emit({ userId: u, peerId: p });
//   }
// }
import { Component, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-register-screen',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="min-h-screen flex items-center justify-center bg-gray-950 px-4">
      <div class="w-full max-w-sm">

        <!-- Logo -->
        <div class="text-center mb-10">
          <div class="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-600 mb-4">
            <svg class="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round"
                d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
          </div>
          <h1 class="text-2xl font-bold text-white tracking-tight">Signal</h1>
          <p class="text-gray-400 text-sm mt-1">Peer-to-peer calling over WebSocket</p>
        </div>

        <!-- Card -->
        <div class="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
          <div>
            <label class="block text-xs font-medium text-gray-400 mb-1.5">Your User ID</label>
            <input
              type="text"
              [(ngModel)]="userId"
              placeholder="e.g. alice"
              class="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
            />
          </div>

          <div>
            <label class="block text-xs font-medium text-gray-400 mb-1.5">Peer User ID (who you want to call)</label>
            <input
              type="text"
              [(ngModel)]="peerId"
              placeholder="e.g. bob"
              class="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
            />
          </div>

          <button
            (click)="handleSubmit()"
            [disabled]="!userId.trim() || !peerId.trim()"
            class="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-lg py-2.5 text-sm transition-colors"
          >
            Connect
          </button>
        </div>

        <p class="text-center text-xs text-gray-600 mt-4">
          Open this app in two tabs with opposite IDs to test
        </p>
      </div>
    </div>
  `
})
export class RegisterScreenComponent {
  @Output() register = new EventEmitter<{ userId: string; peerId: string }>();

  userId = '';
  peerId = '';

  handleSubmit(): void {
    const u = this.userId.trim();
    const p = this.peerId.trim();
    if (!u || !p) return;
    if (u === p) {
      alert('Your ID and peer ID cannot be the same.');
      return;
    }
    this.register.emit({ userId: u, peerId: p });
  }
}