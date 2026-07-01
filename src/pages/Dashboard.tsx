import { useNavigate } from "react-router-dom";

export default function Dashboard() {
  const navigate = useNavigate();

  const cards = [
    { title: "📦 Material Master", path: "/materials" },
    { title: "📍 Location Master", path: "/locations" },
    { title: "🔄 Material Allocation", path: "/allocation" },
    { title: "📊 Reports", path: "/reports" },
    { title: "📥 Import / Export", path: "/import-export" },
    { title: "⚙️ Settings", path: "/settings" },
  ];

  return (
    <div
      style={{
        maxWidth: 900,
        margin: "40px auto",
        padding: 20,
        fontFamily: "Arial",
      }}
    >
      <h1>Engineering Stores Management System</h1>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))",
          gap: 20,
          marginTop: 30,
        }}
      >
        {cards.map((card) => (
          <div
            key={card.title}
            onClick={() => navigate(card.path)}
            style={{
              padding: 30,
              border: "1px solid #ddd",
              borderRadius: 12,
              cursor: "pointer",
              background: "#f8f8f8",
              textAlign: "center",
              fontSize: 20,
              fontWeight: "bold",
            }}
          >
            {card.title}
          </div>
        ))}
      </div>
    </div>
  );
}