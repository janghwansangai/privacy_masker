
import { APP_CONFIG } from './constants';
import { ArrowDownTrayIcon, ShieldCheckIcon, DocumentTextIcon, CogIcon } from '@heroicons/react/24/outline';

function App() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-blue-200">
      {/* Header */}
      <header className="max-w-[1600px] mx-auto px-8 py-8 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-blue-800 text-white rounded-2xl flex items-center justify-center font-black text-2xl shadow-md">
            DP
          </div>
          <span className="font-bold text-2xl tracking-tight text-slate-800">
            Document Privacy Masker
          </span>
        </div>
        <nav className="hidden md:flex gap-10 text-xl font-semibold text-slate-500">
          <a href="#features" className="hover:text-blue-800 transition">특징</a>
          <a href={APP_CONFIG.githubRepo} className="hover:text-blue-800 transition" target="_blank" rel="noreferrer">GitHub</a>
        </nav>
      </header>

      {/* Hero Section */}
      <main className="max-w-[1600px] mx-auto px-8 py-16 md:py-24 flex flex-col items-center justify-center gap-20 text-center">
        <div className="space-y-10 animate-fade-in-up flex flex-col items-center">
          <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-blue-100 text-blue-800 font-bold text-lg lg:text-xl shadow-sm mb-2 border border-blue-200">
            <span>🧑‍🏫 현직 교사가 만들었어요. 안심하고 사용하세요.</span>
          </div>
          <h1 className="text-6xl lg:text-7xl font-extrabold leading-[1.15] text-slate-900 tracking-tight">
            문서 개인정보 <span className="text-blue-800">마스킹 도구</span>
          </h1>
          <p className="text-xl lg:text-2xl text-slate-600 leading-relaxed max-w-3xl font-medium">
            {APP_CONFIG.description}. <br/>
            AI를 일절 사용하지 않고 명확한 규칙 기반 마스킹을 수행하여 데이터 유출 걱정 없이 안심하고 사용할 수 있습니다.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 pt-6 justify-center lg:justify-start">
            <a 
              href={APP_CONFIG.windowsDownloadUrl}
              className="inline-flex items-center justify-center gap-4 bg-green-500 hover:bg-green-600 text-white px-8 py-5 rounded-3xl font-bold text-xl shadow-xl shadow-green-500/30 transition-all hover:-translate-y-1"
            >
              <ArrowDownTrayIcon className="w-8 h-8" />
              <div className="text-left leading-tight">
                <div>Windows 다운로드</div>
                <div className="text-sm font-normal opacity-80">Ver {APP_CONFIG.currentVersion.replace('v', '')}</div>
              </div>
            </a>
            <a 
              href={APP_CONFIG.macDownloadUrl}
              className="inline-flex items-center justify-center gap-4 bg-slate-800 hover:bg-slate-900 text-white px-8 py-5 rounded-3xl font-bold text-xl shadow-xl shadow-slate-800/30 transition-all hover:-translate-y-1"
            >
              <ArrowDownTrayIcon className="w-8 h-8" />
              <div className="text-left leading-tight">
                <div>Mac 다운로드</div>
                <div className="text-sm font-normal opacity-80">Ver {APP_CONFIG.currentVersion.replace('v', '')}</div>
              </div>
            </a>
          </div>
        </div>

        {/* Mockup Image Area */}
        <div className="relative flex flex-col xl:flex-row items-center justify-center w-full max-w-6xl mx-auto gap-10 xl:gap-16 mt-6">
            {/* Before PDF */}
            <div className="bg-white p-10 lg:p-12 rounded-[2.5rem] flex-1 w-full shadow-2xl border border-slate-200 transform transition-transform hover:scale-105 text-left">
              <div className="flex items-center gap-4 mb-10">
                <div className="bg-red-500 text-white text-xl md:text-2xl font-black px-4 py-2 rounded-xl">PDF</div>
                <div className="text-2xl md:text-3xl font-bold text-slate-500 whitespace-nowrap">보고서.pdf</div>
              </div>
              <div className="space-y-8">
                <div className="flex justify-between items-center border-b border-slate-100 pb-5">
                  <span className="text-xl md:text-2xl font-bold text-slate-500 whitespace-nowrap mr-4">이름:</span>
                  <div className="h-10 md:h-12 w-28 md:w-40 bg-red-100 rounded-2xl text-red-600 text-xl md:text-2xl flex items-center justify-center font-bold shadow-sm whitespace-nowrap">홍길동</div>
                </div>
                <div className="flex justify-between items-center border-b border-slate-100 pb-5">
                  <span className="text-xl md:text-2xl font-bold text-slate-500 whitespace-nowrap mr-4">주소:</span>
                  <div className="h-10 md:h-12 w-44 md:w-56 bg-red-100 rounded-2xl text-red-600 text-xl md:text-2xl flex items-center justify-center font-bold px-4 truncate shadow-sm">서울시 강남구...</div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xl md:text-2xl font-bold text-slate-500 whitespace-nowrap mr-4">전화:</span>
                  <div className="h-10 md:h-12 w-36 md:w-48 bg-red-100 rounded-2xl text-red-600 text-xl md:text-2xl flex items-center justify-center font-bold shadow-sm whitespace-nowrap">010-1234-5678</div>
                </div>
              </div>
            </div>

            {/* Arrow */}
            <div className="text-slate-400 rotate-90 xl:rotate-0 flex-shrink-0 my-4 xl:my-0">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-16 h-16 md:w-24 md:h-24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
              </svg>
            </div>

            {/* After PDF */}
            <div className="bg-white p-10 lg:p-12 rounded-[2.5rem] flex-1 w-full shadow-2xl border border-slate-200 relative overflow-hidden group-hover:shadow-green-500/40 transition-all duration-500 hover:-translate-y-2 text-left">
              <div className="absolute inset-0 bg-green-50/40 opacity-0 hover:opacity-100 transition-opacity"></div>
              <div className="relative z-10">
                <div className="flex items-center gap-4 mb-10">
                  <div className="bg-red-500 text-white text-xl md:text-2xl font-black px-4 py-2 rounded-xl">PDF</div>
                  <div className="text-2xl md:text-3xl font-bold text-slate-500 whitespace-nowrap">보고서_마스킹.pdf</div>
                </div>
                <div className="space-y-8">
                  <div className="flex justify-between items-center border-b border-slate-100 pb-5">
                    <span className="text-xl md:text-2xl font-bold text-slate-500 whitespace-nowrap mr-4">이름:</span>
                    <div className="h-10 md:h-12 w-28 md:w-40 bg-slate-800 rounded-2xl shadow-inner"></div>
                  </div>
                  <div className="flex justify-between items-center border-b border-slate-100 pb-5">
                    <span className="text-xl md:text-2xl font-bold text-slate-500 whitespace-nowrap mr-4">주소:</span>
                    <div className="h-10 md:h-12 w-44 md:w-56 bg-slate-800 rounded-2xl shadow-inner"></div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xl md:text-2xl font-bold text-slate-500 whitespace-nowrap mr-4">전화:</span>
                    <div className="h-10 md:h-12 w-36 md:w-48 bg-slate-800 rounded-2xl shadow-inner"></div>
                  </div>
                </div>
              </div>
            </div>
        </div>
      </main>

      {/* Features Section */}
      <section id="features" className="bg-white border-t border-slate-200 py-32">
        <div className="max-w-[1600px] mx-auto px-8">
          <div className="text-center mb-24">
            <h2 className="text-4xl md:text-5xl font-extrabold text-slate-900 tracking-tight mb-6">완벽한 오프라인 보안</h2>
            <p className="text-2xl text-slate-500">개인정보를 가장 안전하고 확실하게 지우는 방법</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-12">
            {APP_CONFIG.features.map((feature, idx) => (
              <div key={idx} className="bg-slate-50 rounded-[2.5rem] p-10 hover:shadow-xl hover:-translate-y-2 transition-all duration-300 border border-slate-100">
                <div className="w-16 h-16 bg-white shadow-sm border border-slate-200 text-blue-700 rounded-2xl flex items-center justify-center mb-8">
                  {idx === 0 && <ShieldCheckIcon className="w-8 h-8" />}
                  {idx === 1 && <CogIcon className="w-8 h-8" />}
                  {idx === 2 && <DocumentTextIcon className="w-8 h-8" />}
                  {idx === 3 && <DocumentTextIcon className="w-8 h-8" />}
                </div>
                <h3 className="text-2xl font-bold text-slate-900 mb-5">{feature.title}</h3>
                <p className="text-lg text-slate-600 leading-relaxed font-medium">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 py-16 text-center text-slate-400 text-lg">
        <div className="max-w-[1600px] mx-auto px-8 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-slate-800 text-slate-300 rounded-md flex items-center justify-center font-black text-sm">
              DP
            </div>
            <span>&copy; 2026 hwansan.kr. All rights reserved.</span>
          </div>
          <div className="flex gap-8 font-bold">
            <a href={APP_CONFIG.githubRepo} className="hover:text-white transition">GitHub 저장소</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
