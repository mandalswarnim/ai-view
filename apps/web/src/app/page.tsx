export default function HomePage() {
  return (
    <>
      <h1>AI View</h1>
      <p>
        AI View checks the photos on UK property listings for signs of AI editing, and tells you
        whether the listing says its images were edited. It works from the listing alone, so treat
        what it shows as things to check at a viewing.
      </p>
      <div className="card">
        <p>
          <strong>This is a development build.</strong> Install the browser extension and open a
          Rightmove listing to see a report. The mobile app and the full site arrive in later
          phases.
        </p>
      </div>
    </>
  );
}
