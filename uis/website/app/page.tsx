import Image from "next/image";
import { MetricStrip } from "../components/MetricStrip";
import { ServiceGrid } from "../components/ServiceGrid";

const HERO_IMAGE =
  "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=1800&q=85";
const NETWORK_IMAGE =
  "https://images.unsplash.com/photo-1551076805-e1869033e561?auto=format&fit=crop&w=1200&q=85";

export default function Home() {
  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#inicio">
          <span>HC</span>HealthCore
        </a>
        <nav>
          <a href="#atencion">Atención</a>
          <a href="#red">Nuestra red</a>
          <a href="#contacto">Contacto</a>
        </nav>
        <a className="appointment" href="mailto:access@healthcore.example">
          Pedir cita
        </a>
      </header>

      <section className="hero" id="inicio">
        <Image
          src={HERO_IMAGE}
          alt=""
          aria-hidden="true"
          fill
          priority
          sizes="100vw"
          className="hero-photo"
        />
        <div className="hero-gradient" aria-hidden="true" />
        <div className="hero-content">
          <p className="eyebrow">Atención ambulatoria · EE. UU. y Reino Unido</p>
          <h1>Cuidarte bien también significa hacerte esperar menos.</h1>
          <p>Atención primaria, especialistas y prevención coordinados alrededor de tu vida.</p>
          <a className="primary-action" href="mailto:access@healthcore.example">
            Encontrar una clínica
          </a>
        </div>
      </section>

      <MetricStrip />

      <section className="services" id="atencion">
        <div className="section-intro">
          <p className="eyebrow">Cuidado conectado</p>
          <h2>Una red preparada para acompañarte.</h2>
        </div>
        <ServiceGrid />
      </section>

      <section className="network" id="red">
        <div>
          <p className="eyebrow">Nuestra red</p>
          <h2>Conocimiento local, estándares compartidos.</h2>
          <p>
            Nueve clínicas en Texas, Florida y Georgia, y tres centros en Londres y Mánchester.
            La misma promesa de acceso claro y atención basada en evidencia.
          </p>
        </div>
        <div className="network-media">
          <Image
            src={NETWORK_IMAGE}
            alt="Profesional de HealthCore atendiendo a una paciente"
            fill
            sizes="50vw"
            className="network-photo"
          />
        </div>
      </section>

      <section className="trust" id="contacto">
        <p className="eyebrow">Confianza por diseño</p>
        <h2>Tu información clínica merece el mismo cuidado que tu salud.</h2>
        <p>HealthCore protege los datos bajo HIPAA y UK GDPR y limita su uso a la prestación segura de atención.</p>
        <a href="mailto:access@healthcore.example">access@healthcore.example</a>
      </section>

      <footer>
        <span>HealthCore Digital</span>
        <span>Atención accesible desde 2011</span>
      </footer>
    </main>
  );
}