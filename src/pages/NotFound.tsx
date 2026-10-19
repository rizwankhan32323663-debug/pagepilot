import { Link } from "react-router-dom";
import { Card, PageHeader, PrimaryButton } from "../components/ui";

export default function NotFound() {
  return (
    <div>
      <PageHeader title="Page not found" description="The page you are looking for does not exist." />
      <Card>
        <p className="text-sm text-gray-600">
          Check the navigation on the left, or go back to the dashboard.
        </p>
        <div className="mt-4">
          <Link to="/">
            <PrimaryButton>Back to Dashboard</PrimaryButton>
          </Link>
        </div>
      </Card>
    </div>
  );
}
