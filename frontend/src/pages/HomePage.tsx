import { Link } from 'react-router-dom';
import {
  Map, TreePine, Eye, Sun, Bird, Leaf, ArrowRight,
  Upload, Search, Compass, Sparkles, CheckCircle2
} from 'lucide-react';

const features = [
  {
    icon: Map,
    color: 'bg-forest-100 text-forest-700',
    title: 'Interactive Yard Planner',
    description: 'Map your property using satellite imagery or upload your own aerial photos. Draw planting zones, mark trees, and build your landscape plan layer by layer.',
    items: ['Import Google Maps / satellite imagery', 'Upload aerial, front, back & side yard photos', 'Draw and label planting zones', 'Place plants with drag-and-drop']
  },
  {
    icon: Sun,
    color: 'bg-yellow-100 text-yellow-700',
    title: 'Sun Path Analysis',
    description: 'Know exactly which areas of your yard get full sun, part shade, or full shade. Uses your location and house orientation to calculate the precise path of the sun.',
    items: ['Summer/winter solstice sun paths', 'Spring/fall equinox calculations', 'Hourly sun position throughout the day', 'Shade zone predictions for planting decisions']
  },
  {
    icon: TreePine,
    color: 'bg-earth-100 text-earth-700',
    title: 'Native Plant Library',
    description: 'Browse a curated database of native plants including Nova Natives selections. Complete plant profiles with everything you need to make informed choices.',
    items: ['Trees, shrubs, perennials, grasses & ferns', 'Sun, water & soil requirements', 'Wildlife value (pollinators, birds, butterflies)', 'Bloom time, fall color & growth rate']
  },
  {
    icon: Eye,
    color: 'bg-purple-100 text-purple-700',
    title: 'AI Growth Visualizer',
    description: 'Upload a photo of your house or yard and let AI show you exactly how a selected plant will look at different stages of growth over time.',
    items: ['Upload house exterior or yard photos', 'Select any plant from the library', 'See 1-year, 3-year, 5-year, 10-year & mature growth', 'Get AI landscaping recommendations']
  },
];

const steps = [
  {
    icon: Search,
    label: 'Browse Plants',
    desc: 'Explore native plants by type, sun, water needs & wildlife value',
    link: '/plants',
    color: 'bg-forest-600',
  },
  {
    icon: Map,
    label: 'Map Your Yard',
    desc: 'Load satellite imagery or upload photos and draw your planting zones',
    link: '/planner',
    color: 'bg-sky-600',
  },
  {
    icon: Compass,
    label: 'Analyze Sun',
    desc: 'Enter your address to calculate sun paths and shade patterns',
    link: '/planner',
    color: 'bg-yellow-600',
  },
  {
    icon: Sparkles,
    label: 'Visualize Growth',
    desc: 'Upload a yard photo and see how plants will look as they mature',
    link: '/visualize',
    color: 'bg-purple-600',
  },
];

const nativeBenefits = [
  'Require 70% less water once established',
  'Support 4x more wildlife species than non-natives',
  'Eliminate need for pesticides and fertilizers',
  'Reduce lawn maintenance by 50–80%',
  'Provide critical food and habitat for declining pollinators',
  'Adapt naturally to local climate extremes',
];

export default function HomePage() {
  return (
    <div>
      {/* Hero */}
      <section className="relative bg-gradient-to-br from-forest-900 via-forest-800 to-forest-700 text-white overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-10 left-10 w-40 h-40 bg-forest-300 rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-20 w-60 h-60 bg-earth-400 rounded-full blur-3xl" />
          <div className="absolute top-1/2 left-1/3 w-32 h-32 bg-yellow-400 rounded-full blur-2xl" />
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-20 sm:py-28 relative">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 mb-6">
              <span className="bg-forest-500/30 border border-forest-400/30 text-forest-200 text-sm px-3 py-1 rounded-full flex items-center gap-1.5">
                <Leaf className="w-3.5 h-3.5" />
                Native Plant Landscaping Planner
              </span>
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-6 leading-tight">
              Design a <span className="text-forest-300">Beautiful</span>,{' '}
              <span className="text-earth-300">Wildlife-Friendly</span> Yard
            </h1>
            <p className="text-lg text-forest-100 mb-8 leading-relaxed max-w-2xl">
              Plan your landscaping with native plants using interactive maps, sun path analysis,
              and AI-powered growth visualization. Import satellite imagery, browse Nova Natives
              plant lists, and see your yard transform before you plant a single seed.
            </p>
            <div className="flex flex-wrap gap-4">
              <Link to="/planner" className="bg-forest-400 hover:bg-forest-300 text-forest-900 font-semibold px-6 py-3 rounded-xl flex items-center gap-2 transition-colors">
                <Map className="w-5 h-5" />
                Start Planning
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link to="/plants" className="bg-white/10 hover:bg-white/20 border border-white/30 text-white font-semibold px-6 py-3 rounded-xl flex items-center gap-2 transition-colors">
                <TreePine className="w-5 h-5" />
                Browse Plants
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="bg-gray-50 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-3">How It Works</h2>
            <p className="text-gray-500 max-w-2xl mx-auto">Four simple steps to plan the native landscape of your dreams</p>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {steps.map((step, i) => (
              <Link
                key={i}
                to={step.link}
                className="card p-5 text-center hover:shadow-md transition-all hover:-translate-y-1 group"
              >
                <div className={`w-12 h-12 ${step.color} rounded-xl flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform`}>
                  <step.icon className="w-6 h-6 text-white" />
                </div>
                <div className="w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center text-xs font-bold text-gray-500 mx-auto mb-2">
                  {i + 1}
                </div>
                <h3 className="font-semibold text-gray-900 mb-1">{step.label}</h3>
                <p className="text-xs text-gray-500 leading-relaxed">{step.desc}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-16 max-w-7xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-3">Everything You Need</h2>
          <p className="text-gray-500">Professional-grade landscaping tools for the homeowner</p>
        </div>
        <div className="grid md:grid-cols-2 gap-8">
          {features.map((f, i) => (
            <div key={i} className="card p-6 hover:shadow-md transition-shadow">
              <div className="flex items-start gap-4">
                <div className={`w-12 h-12 ${f.color} rounded-xl flex items-center justify-center shrink-0`}>
                  <f.icon className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">{f.title}</h3>
                  <p className="text-sm text-gray-500 mb-3 leading-relaxed">{f.description}</p>
                  <ul className="space-y-1.5">
                    {f.items.map((item, j) => (
                      <li key={j} className="flex items-start gap-2 text-sm text-gray-600">
                        <CheckCircle2 className="w-4 h-4 text-forest-500 shrink-0 mt-0.5" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Why native plants */}
      <section className="bg-forest-900 text-white py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Bird className="w-5 h-5 text-forest-300" />
                <span className="text-forest-300 text-sm font-medium">Why Go Native?</span>
              </div>
              <h2 className="text-3xl font-bold mb-4">Native Plants Are the <span className="text-forest-300">Smart Choice</span></h2>
              <p className="text-forest-100 leading-relaxed mb-6">
                Native plants evolved alongside local wildlife for thousands of years. They form
                the foundation of healthy ecosystems, supporting birds, butterflies, bees, and
                countless other creatures — while being far easier to care for than exotic alternatives.
              </p>
              <Link to="/plants" className="bg-forest-400 hover:bg-forest-300 text-forest-900 font-semibold px-5 py-3 rounded-xl flex items-center gap-2 w-fit transition-colors">
                <TreePine className="w-4 h-4" />
                Explore Native Plants
              </Link>
            </div>
            <div>
              <ul className="space-y-3">
                {nativeBenefits.map((benefit, i) => (
                  <li key={i} className="flex items-center gap-3 bg-forest-800 rounded-xl px-4 py-3">
                    <CheckCircle2 className="w-5 h-5 text-forest-400 shrink-0" />
                    <span className="text-forest-100 text-sm">{benefit}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-gradient-to-r from-forest-50 to-sky-50">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Ready to Plan Your Native Yard?</h2>
          <p className="text-gray-600 mb-8">
            Start with the plant library or jump right into mapping your yard.
            No account required — everything runs in your browser.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link to="/planner" className="btn-primary text-base px-6 py-3">
              <Map className="w-5 h-5" />
              Open Yard Planner
            </Link>
            <Link to="/visualize" className="btn-secondary text-base px-6 py-3">
              <Upload className="w-5 h-5" />
              Try AI Visualizer
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
